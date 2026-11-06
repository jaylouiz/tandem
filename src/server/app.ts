// HTTP API (localhost only). Every Feedback action writes exactly what the workflow writes, patches the
// cached issue at once (optimistic), then Pushes unless the developer switched Push off for this Feedback.
import { readFile } from "node:fs/promises";
import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import { answerComment, challengeComment, parseScreenshots, prVerdictComment, roundReactionComment, type PrVerdict } from "../core/contract.ts";
import { alignImages } from "../core/images.ts";
import { NO_COORDINATOR, type RawIssue } from "../core/types.ts";
import { issueLogPath } from "./activity.ts";
import type { Board } from "./board.ts";
import { guard, isIssueNumber, isRepo, isRepoPart, isStringArray, type Access } from "./guard.ts";
import type { PageClients } from "./notifier.ts";
import type { PushEvent, Pusher, PushResult } from "./push.ts";
import type { Source } from "./source.ts";
import type { Store } from "./store.ts";
import type { VersionCheck } from "./version.ts";

export interface Deps {
  board: Board;
  source: Source;
  store: Store;
  pusher: Pusher;
  /** counts pages that raise their own notifications, so the server notifier stays silent for them */
  pages?: PageClients;
  version?: VersionCheck;
  /** Fixture mode only: puts the demo data and every local state back to boot state. Without it the reset route does not exist. */
  reset?: () => Promise<void>;
  /** Host and Origin values that address this server (localAccess); everything else is refused */
  access: Access;
}

export function createApp({ board, source, store, pusher, pages, version, reset, access }: Deps) {
  const app = new Hono();

  app.onError((e, c) => c.json({ error: e.message }, 500));
  app.use("/api/*", guard(access));

  const bad = (c: Context, error: string) => c.json({ error }, 400);
  const optedIn = (repo: unknown): repo is string => isRepo(repo) && store.state.repos.includes(repo);

  app.get("/api/board", (c) => c.json(board.view()));

  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      const notifying = c.req.query("notify") === "1" && pages;
      if (notifying) pages.notifying++;
      // listen for the abort before the first write: Hono does not replay an abort to a late listener
      const aborted = new Promise<void>((resolve) => stream.onAbort(resolve));
      let id = 0;
      const send = (v: unknown) => stream.writeSSE({ event: "board", id: String(++id), data: JSON.stringify(v) });
      let off = () => {};
      const ping = setInterval(() => void stream.writeSSE({ event: "ping", data: "" }).catch(() => {}), 25_000);
      try {
        await send(board.view());
        off = board.subscribe((v) => void send(v).catch(() => {}));
        await aborted;
      } catch {
        // a write to an already closed stream: same as an abort
      } finally {
        clearInterval(ping);
        off();
        if (notifying) pages.notifying--;
      }
    }),
  );

  app.get("/api/version", async (c) => c.json(version ? await version.status() : { running: null, built: null, head: null, pending: false, reason: null }));

  app.post("/api/refresh", async (c) => {
    await board.refreshAll(true);
    await board.refreshCoordinators();
    // a repo that failed to sync is recorded, not thrown: say so instead of "ok"
    const failed = Object.entries(board.view().sync).filter(([, s]) => s.error);
    if (failed.length) return c.json({ error: failed.map(([repo, s]) => `${repo}: ${s.error}`).join("; ") }, 502);
    return c.json({ ok: true });
  });

  // Test-only (E2E, demo runs): mounted only when main.ts passes `reset`, i.e. on fixture data.
  if (reset) {
    app.post("/api/fixture/reset", async (c) => {
      await reset();
      return c.json({ ok: true });
    });
  }

  // ---- repos ----
  app.get("/api/repos", async (c) => c.json({ selected: store.state.repos, available: await source.listRepos(), paths: { ...(await pusher.knownPaths()), ...store.state.repoPaths } }));
  app.put("/api/repos", async (c) => {
    const { repos } = await c.req.json<{ repos: unknown }>();
    if (!Array.isArray(repos) || !repos.every(isRepo)) return bad(c, "repos must be owner/name strings");
    store.setRepos(repos);
    await board.refreshAll(false);
    return c.json({ ok: true });
  });
  app.put("/api/repos/path", async (c) => {
    const { repo, path } = await c.req.json<{ repo: unknown; path: unknown }>();
    if (!isRepo(repo) || typeof path !== "string") return bad(c, "repo must be owner/name and path a string");
    store.setRepoPath(repo, path);
    return c.json({ ok: true });
  });

  // ---- per Card ----
  const card = new Hono<{ Variables: { repo: string; n: number } }>();
  card.use("*", async (c, next) => {
    const [owner, name, n] = [c.req.param("owner") ?? "", c.req.param("name") ?? "", c.req.param("n") ?? ""];
    if (!isRepoPart(owner) || !isRepoPart(name) || !/^\d+$/.test(n) || !isIssueNumber(Number(n))) return bad(c, "bad repo or issue number");
    const repo = `${owner}/${name}`;
    if (!optedIn(repo)) return c.json({ error: `${repo} is not on the Board` }, 404);
    c.set("repo", repo);
    c.set("n", Number(n));
    await next();
  });

  async function feedback(repo: string, n: number, body: string, push: boolean, what: string, extra?: (i: RawIssue) => void) {
    const posted = await source.comment(repo, n, body);
    board.patch(repo, n, (i) => {
      i.comments.push({ id: posted.id, author: "you", body, createdAt: posted.createdAt, url: posted.url });
      extra?.(i);
    });
    return maybePush(repo, n, "feedback", what, push);
  }

  async function maybePush(repo: string, n: number, event: PushEvent, text: string, push: boolean): Promise<PushResult | null> {
    if (!push) return null;
    try {
      const res = await pusher.push(repo, n, event, text);
      // the Push just asked Orca: when the Board's copy of the answer differs, bring it in line, so the Card pane says what the footer says
      if ((res.delivered || res.reason === NO_COORDINATOR) && !!board.view().coordinators[repo] !== res.delivered) await board.refreshCoordinators();
      return res;
    } catch (e) {
      return { delivered: false, runId: null, reason: e instanceof Error ? e.message : String(e) };
    }
  }

  card.post("/answer", async (c) => {
    const { requestId, answer, push = true } = await c.req.json<{ requestId: string; answer: string; push?: boolean }>();
    return c.json({ push: await feedback(c.var.repo, c.var.n, answerComment(requestId, answer), push, `${requestId} answered`) });
  });

  card.post("/accept", async (c) => {
    const { push = true } = await c.req.json<{ push?: boolean }>().catch(() => ({ push: true }));
    const label = board.workflow.agentDecidedLabel;
    await source.removeLabel(c.var.repo, c.var.n, label);
    board.patch(c.var.repo, c.var.n, (i) => (i.labels = i.labels.filter((l) => l !== label)));
    return c.json({ push: await maybePush(c.var.repo, c.var.n, "feedback", "agent decisions accepted", push) });
  });

  card.post("/challenge", async (c) => {
    const { decisionId, text, push = true } = await c.req.json<{ decisionId: string; text: string; push?: boolean }>();
    return c.json({ push: await feedback(c.var.repo, c.var.n, challengeComment(decisionId, text), push, `${decisionId} challenged`) });
  });

  card.post("/round", async (c) => {
    const r = await c.req.json<{ round: number; picks: string[]; rejects: string[]; comment: string; push?: boolean }>();
    return c.json({ push: await feedback(c.var.repo, c.var.n, roundReactionComment(r), r.push ?? true, `design round R${r.round} reacted`) });
  });

  card.post("/pr", async (c) => {
    const { verdict, text = "", requestId = null, push = true } = await c.req.json<{ verdict: PrVerdict; text?: string; requestId?: string | null; push?: boolean }>();
    const hold = verdict === "hold";
    if (hold) await source.addLabels(c.var.repo, c.var.n, ["do-not-merge"]);
    const res = await feedback(c.var.repo, c.var.n, prVerdictComment(requestId, verdict, text), push, `PR ${verdict}`, (i) => {
      if (hold) i.labels = [...new Set([...i.labels, "do-not-merge"])];
    });
    return c.json({ push: res });
  });

  card.post("/start", async (c) => {
    const cur = board.card(c.var.repo, c.var.n);
    return c.json({ push: await maybePush(c.var.repo, c.var.n, "start", cur?.nextStep ?? "triage", true) });
  });

  card.post("/labels", async (c) => {
    const { add = [], remove = [] } = await c.req.json<{ add?: unknown; remove?: unknown }>();
    if (!isStringArray(add) || !isStringArray(remove)) return bad(c, "add and remove must be label names");
    if (add.length) await source.addLabels(c.var.repo, c.var.n, add);
    for (const l of remove) await source.removeLabel(c.var.repo, c.var.n, l);
    board.patch(c.var.repo, c.var.n, (i) => (i.labels = [...new Set([...i.labels.filter((l) => !remove.includes(l)), ...add])]));
    return c.json({ ok: true });
  });

  card.post("/seen", async (c) => {
    const { seen = true } = await c.req.json<{ seen?: boolean }>().catch(() => ({ seen: true }));
    store.setSeen(`${c.var.repo}#${c.var.n}`, seen);
    board.emit();
    return c.json({ ok: true });
  });

  // Signed screenshot URLs of one cached comment, aligned to its parsed screenshots. Never stored: they expire.
  card.get("/images", async (c) => {
    const id = c.req.query("comment") ?? "";
    const comment = board.rawIssue(c.var.repo, c.var.n)?.comments.find((x) => x.id === id);
    if (!comment) return c.json({ error: "unknown comment" }, 404);
    const shots = parseScreenshots(comment.body);
    try {
      return c.json({ srcs: alignImages(shots, await source.signedImages(id)), signed: true });
    } catch (e) {
      return c.json({ srcs: shots.map((s) => s.src), signed: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  card.get("/log", async (c) => {
    try {
      return c.json({ log: await readFile(issueLogPath(c.var.repo, c.var.n), "utf8") });
    } catch {
      return c.json({ log: null });
    }
  });

  app.route("/api/cards/:owner/:name/:n", card);

  app.post("/api/issues", async (c) => {
    const { repo, title, body = "", labels = ["inbox"] } = await c.req.json<{ repo: unknown; title: unknown; body?: unknown; labels?: unknown }>();
    if (!optedIn(repo)) return bad(c, "repo is not on the Board");
    if (typeof title !== "string" || !title.trim() || typeof body !== "string" || !isStringArray(labels)) return bad(c, "title, body and labels must be text");
    const issue = await source.createIssue(repo, title, body, labels);
    board.addIssue(issue);
    return c.json({ number: issue.number, url: issue.url });
  });

  app.post("/api/coordinator/start", async (c) => {
    const { repo, numbers } = await c.req.json<{ repo: unknown; numbers: unknown }>();
    if (!optedIn(repo)) return bad(c, "repo is not on the Board");
    if (!Array.isArray(numbers) || !numbers.length || !numbers.every(isIssueNumber)) return bad(c, "numbers must be issue numbers");
    const path = store.state.repoPaths[repo] ?? (await pusher.knownPaths())[repo];
    if (!path) return c.json({ error: `No local checkout known for ${repo}. Set its path in Settings.` }, 400);
    await pusher.startCoordinator(repo, path, numbers);
    await board.refreshCoordinators();
    return c.json({ ok: true });
  });

  return app;
}
