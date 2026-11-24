import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decisionFeedback, feedbackComment, prFeedback, roundFeedback, type Feedback } from "../core/answer.ts";
import { parseMarker } from "../core/contract.ts";
import { NO_RUN } from "../core/types.ts";
import { createApp } from "./app.ts";
import { Board, type BoardView } from "./board.ts";
import { FixtureSource, fixtureReset } from "./fixture.ts";
import { PageClients } from "./notifier.ts";
import { localAccess } from "./guard.ts";
import { FakePusher } from "./push.ts";
import { CACHE_VERSION, Store } from "./store.ts";

let app: ReturnType<typeof createApp>;
let source: FixtureSource;
let pusher: FakePusher;
let board: Board;
let store: Store;

beforeEach(async () => {
  process.env.TANDEM_HOME = mkdtempSync(join(tmpdir(), "tandem-"));
  source = new FixtureSource();
  store = new Store({ repos: await source.listRepos() });
  pusher = new FakePusher(new Set(["acme/app"]));
  board = new Board(source, store, pusher, { pollMs: 60_000, persist: false });
  await board.refreshAll(true);
  app = createApp({ board, source, store, pusher, access });
});

const access = localAccess(4317);
const HOST = { host: "127.0.0.1:4317" };
const WRITE = { ...HOST, "content-type": "application/json", "x-tandem": "1" };
const get = (path: string, headers: Record<string, string> = HOST) => app.request(path, { headers });
const post = (path: string, body: unknown, headers: Record<string, string> = WRITE) => app.request(path, { method: "POST", body: JSON.stringify(body), headers });
const view = async () => (await (await get("/api/board")).json()) as BoardView;
const card = async (n: number) => (await view()).cards.find((c) => c.repo === "acme/app" && c.number === n)!;

describe("feedback", () => {
  it("answers a decision request as the user and pushes", async () => {
    const res = await post("/api/cards/acme/app/105/answer", { requestId: "D1", answer: "B" });
    expect((await res.json()).push).toMatchObject({ delivered: true });
    const raw = (await source.fetchIssues("acme/app", null)).find((i) => i.number === 105)!;
    const last = raw.comments.at(-1)!.body;
    expect(last).toBe("D1: B");
    expect(parseMarker(last)).toBeNull();
    const c = await card(105);
    expect(c.waiting).toBeNull();
    expect(c.awaitingPickup).toBe(true);
    expect(pusher.sent).toEqual([{ repo: "acme/app", number: 105, event: "feedback", text: "D1 answered" }]);
  });

  it("writes, for every kind of Feedback, the comment the web app shows for it beforehand (#8: an option in Focus shows its comment)", async () => {
    const all: Feedback[] = [
      decisionFeedback("D1", "B: field-level merge", ""),
      decisionFeedback("D1", "B: field-level merge", "keep the undo toast"),
      decisionFeedback("D1", null, "neither"),
      prFeedback("D1", "approve", ""),
      prFeedback("D1", "hold", ""),
      prFeedback("D1", "send-back", "the empty state is missing"),
      prFeedback(null, "approve", ""),
      roundFeedback(1, ["b"], [], ""),
      roundFeedback(1, ["a", "b"], ["c"], "header from a, list from b"),
    ];
    for (const f of all) {
      const res = await post(`/api/cards/acme/app/105/${f.action}`, { ...f.body, push: false });
      expect(res.status).toBe(200);
      const raw = (await source.fetchIssues("acme/app", null)).find((i) => i.number === 105)!;
      expect(raw.comments.at(-1)!.body).toBe(feedbackComment(f));
      expect(parseMarker(raw.comments.at(-1)!.body)).toBeNull();
    }
  });

  it("can switch Push off for one piece of Feedback", async () => {
    const res = await post("/api/cards/acme/app/105/answer", { requestId: "D1", answer: "A", push: false });
    expect((await res.json()).push).toBeNull();
    expect(pusher.sent).toEqual([]);
  });

  it("reports that no Run was found instead of failing", async () => {
    const res = await post("/api/cards/acme/agent-workflow/21/start", {});
    expect((await res.json()).push).toMatchObject({ delivered: false, reason: NO_RUN });
  });

  it("the Board carries no coordinator state, whatever a Push finds (#14)", async () => {
    expect("coordinators" in (await view())).toBe(false);
    await post("/api/cards/acme/app/105/answer", { requestId: "D1", answer: "B" });
    pusher.live.clear();
    const res = await post("/api/cards/acme/app/106/start", {});
    expect((await res.json()).push).toMatchObject({ delivered: false, reason: NO_RUN });
    expect("coordinators" in (await view())).toBe(false);
  });

  it("accepts agent decisions by removing the label", async () => {
    await post("/api/cards/acme/app/107/accept", {});
    const c = await card(107);
    expect(c.labels).not.toContain("agent-decided");
    expect(c.decisionsToAccept).toEqual([]);
    expect(c.waiting).toBeNull();
  });

  it("holds a PR with do-not-merge", async () => {
    await post("/api/cards/acme/app/106/pr", { verdict: "hold", requestId: "D1", text: "wait for release" });
    const c = await card(106);
    expect(c.labels).toContain("do-not-merge");
    expect(c.onHold).toBe(true);
  });

  it("marks a Look Seen and captures an idea into the Inbox", async () => {
    await post("/api/cards/acme/app/108/seen", {});
    expect((await card(108)).seenAt).not.toBeNull();
    const res = await post("/api/issues", { repo: "acme/app", title: "New idea" });
    const { number } = await res.json();
    expect((await card(number)).phase).toBe("Inbox");
  });
});

describe("triage", () => {
  it("refresh answers ok, or the repos that failed to sync (the web app shows them)", async () => {
    expect(await (await post("/api/refresh", {})).json()).toEqual({ ok: true });
    vi.spyOn(source, "fetchIssues").mockRejectedValue(new Error("rate limited"));
    const res = await post("/api/refresh", {});
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("acme/app: rate limited");
  });

  it("moves an Inbox Card to the Backlog with labels only, posting no comment", async () => {
    const before = (await source.fetchIssues("acme/app", null)).find((i) => i.number === 101)!.comments.length;
    await post("/api/cards/acme/app/101/labels", { add: ["needs-spec"], remove: ["inbox"] });
    const c = await card(101);
    expect(c).toMatchObject({ phase: "Backlog", nextStep: "specify" });
    const raw = (await source.fetchIssues("acme/app", null)).find((i) => i.number === 101)!;
    expect(raw.comments.length).toBe(before);
  });

  it("holds and releases with on-hold", async () => {
    await post("/api/cards/acme/app/103/labels", { add: ["on-hold"], remove: [] });
    expect((await card(103)).onHold).toBe(true);
    await post("/api/cards/acme/app/103/labels", { add: [], remove: ["on-hold"] });
    expect((await card(103)).onHold).toBe(false);
  });

  it("creates a label on first use: priority and needs-wayfinder reach the Card", async () => {
    await post("/api/cards/acme/app/102/labels", { add: ["priority:3", "needs-wayfinder"], remove: [] });
    expect(await card(102)).toMatchObject({ priority: 3, fog: true, nextStep: null, phase: "Inbox" });
    await post("/api/cards/acme/app/102/labels", { add: ["priority:1"], remove: ["priority:3", "needs-wayfinder"] });
    expect(await card(102)).toMatchObject({ priority: 1, fog: false });
  });

  it("streams the workflow config so the web app can re-derive a Card", async () => {
    expect((await view()).workflow.nextStep).toMatchObject({ ready: "build" });
  });
});

describe("Hand to agent writes the native issue status (#18)", () => {
  const status = async (repo: string, n: number) => (await source.fetchIssues(repo, null)).find((i) => i.number === n)!.status ?? null;
  const B = "acme/agent-workflow"; // no Run for it: a Push is not delivered

  it("sets Todo before the Push, and the Card is handed for every page and after a restart of the page", async () => {
    const order: string[] = [];
    const set = vi.spyOn(source, "setStatus");
    set.mockImplementation(async (...a) => (order.push(`status ${a[2]}`), FixtureSource.prototype.setStatus.apply(source, a)));
    vi.spyOn(pusher, "push").mockImplementation(async (...a) => (order.push("push"), FakePusher.prototype.push.apply(pusher, a)));
    const before = (await source.fetchIssues("acme/app", null)).find((i) => i.number === 130)!.comments.length;
    const res = await post("/api/cards/acme/app/130/start", {});
    expect(await res.json()).toEqual({ push: { delivered: true, runId: "run_fake_acme/app", reason: null }, restoreError: null });
    expect(order).toEqual(["status Todo", "push"]);
    expect(set).toHaveBeenCalledWith("acme/app", 130, "Todo");
    expect(await card(130)).toMatchObject({ handed: true, status: "Todo", phase: "Backlog" });
    // a status is the whole write: no comment, so no marker an agent could read
    expect((await source.fetchIssues("acme/app", null)).find((i) => i.number === 130)!.comments.length).toBe(before);
    // GitHub has it: a fresh read of the repo (another device, a restart) shows the Card handed
    await board.refreshAll(true);
    expect((await card(130)).handed).toBe(true);
  });

  it("a status write that fails stops before the Push: nothing is sent, the Card is not handed, the reason comes back", async () => {
    vi.spyOn(source, "setStatus").mockRejectedValue(new Error("GitHub GraphQL: viewer cannot set status"));
    const res = await post("/api/cards/acme/app/130/start", {});
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("GitHub GraphQL: viewer cannot set status");
    expect(pusher.sent).toEqual([]);
    expect(await card(130)).toMatchObject({ handed: false, status: null });
  });

  it("a Push that finds no Run puts the status back: Backlog for an issue that had none, the old one otherwise", async () => {
    const set = vi.spyOn(source, "setStatus");
    const res = await post(`/api/cards/${B}/40/start`, {});
    expect(await res.json()).toEqual({ push: { delivered: false, runId: null, reason: NO_RUN }, restoreError: null });
    expect(set.mock.calls.map((c) => c[2])).toEqual(["Todo", "Backlog"]);
    expect(await status(B, 40)).toBe("Backlog");
    expect((await (await view()).cards.find((c) => c.repo === B && c.number === 40))!.handed).toBe(false);
    await source.setStatus(B, 40, "In review");
    await board.refreshAll(true);
    set.mockClear();
    await post(`/api/cards/${B}/40/start`, {});
    expect(set.mock.calls.map((c) => c[2])).toEqual(["Todo", "In review"]);
    expect(await status(B, 40)).toBe("In review");
  });

  it("a Push that throws puts the status back and is reported as not delivered", async () => {
    vi.spyOn(pusher, "push").mockRejectedValue(new Error("could not reach Orca"));
    const res = await post("/api/cards/acme/app/130/start", {});
    expect(await res.json()).toEqual({ push: { delivered: false, runId: null, reason: "could not reach Orca" }, restoreError: null });
    expect(await status("acme/app", 130)).toBe("Backlog");
    expect((await card(130)).handed).toBe(false);
  });

  it("a status that cannot be put back is named: the Card keeps Todo and says so", async () => {
    const real = source.setStatus.bind(source);
    vi.spyOn(source, "setStatus").mockImplementation(async (repo, n, s) => {
      if (s !== "Todo") throw new Error("GitHub could not be reached");
      return real(repo, n, s);
    });
    const res = await post(`/api/cards/${B}/40/start`, {});
    expect(await res.json()).toMatchObject({ push: { delivered: false }, restoreError: `${B}#40 keeps the status Todo: GitHub could not be reached` });
    expect(await status(B, 40)).toBe("Todo");
  });

  it("a Card that is handed already is pushed again without a second status write (a retry from another page)", async () => {
    const set = vi.spyOn(source, "setStatus");
    const res = await post("/api/cards/acme/app/132/start", {});
    expect((await res.json()).push).toMatchObject({ delivered: true });
    expect(set).not.toHaveBeenCalled();
    expect((await card(132)).handed).toBe(true);
  });

  it("a repo that offers no statuses: the Push goes out, nothing is written, the Card is not shown as handed", async () => {
    const set = vi.spyOn(source, "setStatus").mockResolvedValue(false);
    const res = await post("/api/cards/acme/app/130/start", {});
    expect(await res.json()).toEqual({ push: { delivered: true, runId: "run_fake_acme/app", reason: null }, restoreError: null });
    expect(set).toHaveBeenCalledTimes(1);
    expect(await card(130)).toMatchObject({ handed: false, status: null });
    // and an undelivered Push has nothing to put back
    set.mockClear();
    await post(`/api/cards/${B}/40/start`, {});
    expect(set).toHaveBeenCalledTimes(1);
  });

  it("Start coordinator hands its Cards: Todo for each, put back when the start fails", async () => {
    store.setRepoPath(B, "/tmp/agent-workflow");
    expect((await post("/api/coordinator/start", { repo: B, numbers: [40, 21] })).status).toBe(200);
    expect([await status(B, 40), await status(B, 21)]).toEqual(["Todo", "Todo"]);
    const cards = (await view()).cards.filter((c) => c.repo === B && [40, 21].includes(c.number));
    expect(cards.map((c) => c.handed)).toEqual([true, true]);

    await source.setStatus(B, 40, "Backlog");
    await source.setStatus(B, 21, "Backlog");
    await board.refreshAll(true);
    vi.spyOn(pusher, "startCoordinator").mockRejectedValue(new Error("orca agent launch failed"));
    const res = await post("/api/coordinator/start", { repo: B, numbers: [40, 21] });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("orca agent launch failed");
    expect([await status(B, 40), await status(B, 21)]).toEqual(["Backlog", "Backlog"]);
  });

  it("Start coordinator leaves a Card that has started work at its status and hands the others", async () => {
    store.setRepoPath(B, "/tmp/agent-workflow");
    await source.setStatus(B, 40, "In progress");
    await source.setStatus(B, 21, "In review");
    await board.refreshAll(true);
    const set = vi.spyOn(source, "setStatus");
    expect((await post("/api/coordinator/start", { repo: B, numbers: [40, 21, 22] })).status).toBe(200);
    expect(set.mock.calls.map((c) => [c[1], c[2]])).not.toContainEqual([40, "Todo"]);
    expect(set.mock.calls.map((c) => [c[1], c[2]])).not.toContainEqual([21, "Todo"]);
    expect([await status(B, 40), await status(B, 21), await status(B, 22)]).toEqual(["In progress", "In review", "Todo"]);
  });

  it("Start coordinator whose second status write fails starts nothing and puts the first back", async () => {
    store.setRepoPath(B, "/tmp/agent-workflow");
    const start = vi.spyOn(pusher, "startCoordinator");
    const real = source.setStatus.bind(source);
    vi.spyOn(source, "setStatus").mockImplementation(async (repo, n, s) => {
      if (n === 21 && s === "Todo") throw new Error("boom");
      return real(repo, n, s);
    });
    const res = await post("/api/coordinator/start", { repo: B, numbers: [40, 21] });
    expect(res.status).toBe(500);
    expect(start).not.toHaveBeenCalled();
    expect([await status(B, 40), await status(B, 21)]).toEqual(["Backlog", null]);
  });

  it("re-steering a handed Card writes the status with the labels; hold and release leaves it ready to hand again", async () => {
    await post("/api/cards/acme/app/132/labels", { add: ["on-hold"], remove: [], status: "Backlog" });
    expect(await card(132)).toMatchObject({ handed: false, status: "Backlog", onHold: true });
    await post("/api/cards/acme/app/132/labels", { add: [], remove: ["on-hold"] });
    expect(await card(132)).toMatchObject({ handed: false, status: "Backlog", onHold: false });
    expect(await status("acme/app", 132)).toBe("Backlog");
    // hand -> re-steer -> hand again
    await post("/api/cards/acme/app/132/start", {});
    expect((await card(132)).handed).toBe(true);
  });

  it("a label write without a status leaves the status alone; a bad status is refused before anything is written", async () => {
    const set = vi.spyOn(source, "setStatus");
    await post("/api/cards/acme/app/132/labels", { add: ["priority:1"], remove: [] });
    expect(set).not.toHaveBeenCalled();
    expect((await card(132)).handed).toBe(true);
    const labels = vi.spyOn(source, "addLabels");
    for (const status of [3, "", "  ", null, ["Backlog"]]) expect((await post("/api/cards/acme/app/132/labels", { add: ["x"], remove: [], status })).status, JSON.stringify(status)).toBe(400);
    expect(labels).not.toHaveBeenCalled();
  });

  it("a status write that fails after the labels went through reports it, and the Board shows the labels as written", async () => {
    vi.spyOn(source, "setStatus").mockRejectedValue(new Error("boom"));
    const res = await post("/api/cards/acme/app/132/labels", { add: ["on-hold"], remove: [], status: "Backlog" });
    expect(res.status).toBe(500);
    expect(await card(132)).toMatchObject({ onHold: true, status: "Todo", handed: false });
  });

  it("a status changed on GitHub reaches the Board with the next poll", async () => {
    expect((await card(103)).phase).toBe("Backlog");
    await source.setStatus("acme/app", 103, "In progress"); // an agent, or the developer on github.com
    await board.refreshAll(false);
    expect(await card(103)).toMatchObject({ phase: "Build", status: "In progress" });
  });
});

describe("launch", () => {
  it("counts pages that notify by themselves while their stream is open", async () => {
    const pages = new PageClients();
    // a real socket: the Host header carries its port, known once it listens
    let a: ReturnType<typeof createApp> | undefined;
    const server = serve({ fetch: (req) => a!.fetch(req), port: 0, hostname: "127.0.0.1" });
    await new Promise((r) => server.once("listening", r));
    const port = (server.address() as AddressInfo).port;
    a = createApp({ board, source, store: new Store(), pusher, pages, access: localAccess(port) });
    const base = `http://127.0.0.1:${port}`;
    const plain = new AbortController();
    const notify = new AbortController();
    await fetch(`${base}/api/events`, { signal: plain.signal });
    await fetch(`${base}/api/events?notify=1`, { signal: notify.signal });
    expect(pages.notifying).toBe(1);
    notify.abort();
    await vi.waitFor(() => expect(pages.notifying).toBe(0));
    plain.abort();
    server.close();
  });

  it("does not leak a notifying page that drops before its first snapshot is written", async () => {
    const pages = new PageClients();
    const a = createApp({ board, source, store: new Store(), pusher, pages, access });
    const res = await a.request("/api/events?notify=1", { headers: HOST }); // nobody reads: the first write is still pending
    expect(pages.notifying).toBe(1);
    await res.body!.cancel(); // the page drops now; Hono does not replay this abort to a listener added later
    await vi.waitFor(() => expect(pages.notifying).toBe(0), { timeout: 2000 });
  });

  it("serves the version status, off without a checkout stamp", async () => {
    expect(await (await get("/api/version")).json()).toMatchObject({ pending: false });
  });

  it("starts from the cache with an incremental refresh, not a forced full fetch", async () => {
    const home = mkdtempSync(join(tmpdir(), "tandem-cold-"));
    process.env.TANDEM_HOME = home;
    const st = new Store({ repos: ["acme/app"] });
    const fetched: (string | null)[] = [];
    const src = new FixtureSource();
    const orig = src.fetchIssues.bind(src);
    src.fetchIssues = async (repo, since, lookback) => (fetched.push(since), orig(repo, since, lookback));
    st.saveCache({ "acme/app": { v: CACHE_VERSION, fullAt: new Date().toISOString(), syncedAt: new Date().toISOString(), issues: await orig("acme/app", null) } });
    const b = new Board(src, st, new FakePusher(new Set()), { pollMs: 60_000, persist: true });
    expect(b.view().cards.length).toBeGreaterThan(0); // cached Cards before any sync
    await b.start();
    b.stop();
    expect(fetched).toEqual([]); // nothing changed upstream: no fetch at all
    const cold = new Board(src, new Store({ repos: ["acme/app"] }), new FakePusher(new Set()), { pollMs: 60_000, persist: false });
    await cold.start();
    cold.stop();
    expect(fetched).toEqual([null]); // an empty cache pays the full fetch once
  });

  it("re-fetches in full once when the cache was written by an older build (no version)", async () => {
    const home = mkdtempSync(join(tmpdir(), "tandem-old-cache-"));
    process.env.TANDEM_HOME = home;
    const st = new Store({ repos: ["acme/app"] });
    const fetched: (string | null)[] = [];
    const src = new FixtureSource();
    const orig = src.fetchIssues.bind(src);
    src.fetchIssues = async (repo, since, lookback) => (fetched.push(since), orig(repo, since, lookback));
    // an older build also wrote fields that no longer exist (parent, assignees, blockedBy): they are read without error
    const old = (await orig("acme/app", null)).map((i) => ({ ...i, parent: null, assignees: [], blockedBy: [] }));
    st.saveCache({ "acme/app": { syncedAt: new Date().toISOString(), issues: old as never } }); // no `v`
    const b = new Board(src, st, new FakePusher(new Set()), { pollMs: 60_000, persist: true });
    expect(b.view().cards.length).toBeGreaterThan(0);
    await b.start();
    b.stop();
    expect(fetched).toEqual([null]); // the first sync is a full one
    expect(st.loadCache()["acme/app"]!.v).toBe(CACHE_VERSION); // and the next start is incremental again
  });

  describe("a stale cache whose full refetch keeps failing", () => {
    const REPO = "acme/app";
    async function staleBoard() {
      process.env.TANDEM_HOME = mkdtempSync(join(tmpdir(), "tandem-backoff-"));
      const st = new Store({ repos: [REPO] });
      const src = new FixtureSource();
      const orig = src.fetchIssues.bind(src);
      const calls: (string | null)[] = [];
      let fail = true;
      let changed = false;
      src.fetchIssues = async (repo, since, lookback) => {
        calls.push(since);
        if (fail) throw new Error("rate limited");
        return orig(repo, since, lookback);
      };
      src.changed = async () => changed;
      const old = (await orig(REPO, null)).map(({ parent: _p, assignees: _a, blockedBy: _b, ...rest }) => rest);
      st.saveCache({ [REPO]: { syncedAt: new Date().toISOString(), issues: old as never } }); // no `v`: an older build wrote it
      const b = new Board(src, st, new FakePusher(new Set()), { pollMs: 15_000, persist: true });
      return { b, st, calls, setFail: (f: boolean) => (fail = f), setChanged: (c: boolean) => (changed = c) };
    }

    it("retries on a doubling backoff, not on every poll tick; the ETag path keeps running", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        const { b, calls, setChanged } = await staleBoard();
        await b.refreshAll(false); // first attempt: a full fetch, fails
        expect(calls).toEqual([null]);
        for (let i = 0; i < 3; i++) (vi.advanceTimersByTime(15_000), await b.refreshAll(false)); // ticks inside the first minute
        expect(calls).toEqual([null]); // no retry, and `changed()` (false) saw no reason to fetch
        expect(b.view().sync[REPO]!.error).toBe("rate limited"); // still reported
        expect(b.view().sync[REPO]!.syncing).toBe(false);
        vi.advanceTimersByTime(60_000);
        await b.refreshAll(false);
        expect(calls).toEqual([null, null]); // 1 min later: the second full attempt
        vi.advanceTimersByTime(119_000);
        await b.refreshAll(false);
        expect(calls).toHaveLength(2); // the next wait is 2 min
        vi.advanceTimersByTime(1_000);
        await b.refreshAll(false);
        expect(calls).toHaveLength(3);
        // the ETag path stays: a change upstream still triggers an incremental fetch while backed off
        setChanged(true);
        await b.refreshAll(false);
        expect(calls).toHaveLength(4);
        expect(calls[3]).not.toBeNull(); // incremental (since set), not a full refetch
      } finally {
        vi.useRealTimers();
      }
    });

    it("caps the wait at 30 minutes, clears it on success and stamps the cache version only on a full fetch", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        const { b, st, calls, setFail, setChanged } = await staleBoard();
        for (let i = 0; i < 6; i++) (await b.refreshAll(false), vi.advanceTimersByTime(31 * 60_000)); // waits 1, 2, 4, 8, 16, then 32 min uncapped
        expect(calls).toHaveLength(6);
        await b.refreshAll(false); // attempt 7 (the gap was 31 min >= the previous wait): fails, next wait would be 64 min
        expect(calls).toHaveLength(7);
        vi.advanceTimersByTime(29 * 60_000);
        await b.refreshAll(false);
        expect(calls).toHaveLength(7); // still waiting
        vi.advanceTimersByTime(60_000);
        await b.refreshAll(false);
        expect(calls).toHaveLength(8); // 30 min after the failure: the cap
        // an incremental fetch while backed off does not mark the old-shaped cache as current
        setFail(false);
        setChanged(true);
        await b.refreshAll(false);
        expect(st.loadCache()[REPO]!.v).not.toBe(CACHE_VERSION);
        expect(b.view().sync[REPO]!.error).toBe("rate limited"); // the failure stays visible: the cache is still old-shaped
        // the developer's explicit refresh ignores the backoff, and its success makes the cache current
        await b.refresh(REPO, true);
        expect(calls.at(-1)).toBeNull();
        expect(st.loadCache()[REPO]!.v).toBe(CACHE_VERSION);
        expect(b.view().sync[REPO]!.error).toBeNull();
        setChanged(false);
        const n = calls.length;
        await b.refreshAll(false);
        expect(calls).toHaveLength(n); // back to the quiet poll
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("a failed poll (#2)", () => {
    const REPO = "acme/app";
    /** A Board with a current cache whose source can be made to fail: `changed()` (the ETag check) or `fetchIssues`. */
    async function board() {
      const st = new Store({ repos: [REPO] }, { memory: true });
      const src = new FixtureSource();
      const orig = src.fetchIssues.bind(src);
      const calls: (string | null)[] = [];
      const s = { failChanged: false, failFetch: false, changed: false };
      src.changed = async () => {
        if (s.failChanged) throw new Error("GitHub could not be reached: fetch failed (ENOTFOUND)");
        return s.changed;
      };
      src.fetchIssues = async (repo, since, lookback) => {
        calls.push(since);
        if (s.failFetch) throw new Error("GitHub POST /graphql: 502 Bad Gateway");
        return orig(repo, since, lookback);
      };
      const b = new Board(src, st, new FakePusher(new Set()), { pollMs: 15_000, persist: false });
      await b.refreshAll(false); // no cache: the first full fetch
      calls.length = 0;
      return { b, src, s, calls, sync: () => b.view().sync[REPO]! };
    }

    it("a single failed poll shows no error; the next poll that works clears the streak, also when nothing changed", async () => {
      const { b, s, calls, sync } = await board();
      s.failChanged = true;
      await b.refreshAll(false);
      expect(sync()).toMatchObject({ error: null, errorAt: null }); // one blip: not shown
      s.failChanged = false;
      await b.refreshAll(false);
      expect(sync()).toMatchObject({ error: null, errorAt: null });
      expect(calls).toHaveLength(1); // after a failure the ETag is not trusted: one incremental fetch
      expect(calls[0]).not.toBeNull();
      await b.refreshAll(false);
      expect(calls).toHaveLength(1); // healthy again: back to the quiet ETag poll
    });

    it("reports from the second failed poll in a row, with the time of the first, and recovers by itself on a quiet repo", async () => {
      vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-24T11:05:00Z") });
      try {
        const { b, s, sync } = await board();
        const okAt = sync().okAt;
        s.failChanged = s.failFetch = true; // the network is down: the ETag check fails, and so does the fetch the next poll goes for
        await b.refreshAll(false);
        vi.advanceTimersByTime(15_000);
        await b.refreshAll(false);
        expect(sync()).toMatchObject({ error: "GitHub POST /graphql: 502 Bad Gateway", errorAt: "2026-11-24T11:05:00.000Z", okAt });
        expect(b.view().cards.length).toBeGreaterThan(0); // the last synced Cards stay
        // the network is back and nothing changed in the repo meanwhile: the error must not stick (it did until the repo's next change)
        s.failChanged = s.failFetch = false;
        vi.advanceTimersByTime(15_000);
        const seen: BoardView[] = [];
        b.subscribe((v) => seen.push(v));
        await b.refreshAll(false);
        await new Promise((r) => setTimeout(r, 0));
        expect(sync()).toMatchObject({ error: null, errorAt: null, okAt: "2026-11-24T11:05:30.000Z" });
        expect(seen.at(-1)?.sync[REPO]!.error).toBeNull(); // and the page is told
      } finally {
        vi.useRealTimers();
      }
    });

    it("a change whose fetch failed is not skipped: the next poll fetches although GitHub now answers 'not changed'", async () => {
      const { b, src, s, calls, sync } = await board();
      s.changed = true; // GitHub: something changed (the new ETag is stored by this answer)...
      s.failFetch = true; // ...but fetching it fails
      await b.refreshAll(false);
      expect(calls).toHaveLength(1);
      s.changed = false; // the next "changed?" compares against the stored ETag: not changed
      s.failFetch = false;
      await src.comment(REPO, 105, "D1: B"); // the change that was never fetched
      await b.refreshAll(false);
      expect(calls).toHaveLength(2);
      expect(b.rawIssue(REPO, 105)!.comments.at(-1)!.body).toBe("D1: B");
      expect(sync().error).toBeNull();
    });

    it("a refresh the developer asked for reports its failure at once", async () => {
      const { b, s, sync } = await board();
      s.failFetch = true;
      await b.refresh(REPO, true);
      expect(sync().error).toBe("GitHub POST /graphql: 502 Bad Gateway");
      expect(sync().syncing).toBe(false);
    });
  });

  describe("a scheduled full fetch (#16: an issue GitHub no longer has leaves the Board)", () => {
    const REPO = "acme/app";
    const HOUR = 3_600_000;
    async function board() {
      const st = new Store({ repos: [REPO] }, { memory: true });
      const src = new FixtureSource();
      const orig = src.fetchIssues.bind(src);
      const calls: (string | null)[] = [];
      const s = { gone: new Set<number>(), fail: false };
      src.changed = async () => false;
      src.fetchIssues = async (repo, since, lookback) => {
        calls.push(since);
        if (s.fail) throw new Error("GitHub POST /graphql: 502 Bad Gateway");
        return (await orig(repo, since, lookback)).filter((i) => !s.gone.has(i.number));
      };
      const b = new Board(src, st, new FakePusher(new Set()), { pollMs: 15_000, persist: false });
      await b.refreshAll(false);
      calls.length = 0;
      const waits = () => b.view().cards.some((c) => c.number === 105 && !!c.waiting);
      return { b, s, calls, waits, src };
    }

    it("an incremental sync keeps a vanished issue; the full fetch after fullSyncHours drops it, quietly", async () => {
      vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-24T08:00:00Z") });
      try {
        const { b, s, calls, waits, src } = await board();
        expect(waits()).toBe(true); // #105 waits on a decision
        s.gone.add(105); // deleted, transferred, or the repo was recreated
        src.changed = async () => true;
        vi.advanceTimersByTime(HOUR);
        await b.refreshAll(false);
        expect(calls.at(-1)).not.toBeNull(); // incremental
        expect(waits()).toBe(true); // nothing tells an incremental sync that it is gone
        src.changed = async () => false;
        vi.advanceTimersByTime(5 * HOUR);
        const snaps: BoardView[] = [];
        b.subscribe((v) => snaps.push(v));
        await b.refreshAll(false); // 6 h after the last full fetch
        await new Promise((r) => setTimeout(r, 0));
        expect(calls.at(-1)).toBeNull(); // a full fetch, although "changed?" said no
        expect(waits()).toBe(false);
        expect(b.rawIssue(REPO, 105)).toBeNull();
        expect(snaps.every((v) => !v.sync[REPO]!.syncing)).toBe(true); // quiet: never "Syncing"
        const n = calls.length;
        await b.refreshAll(false);
        expect(calls).toHaveLength(n); // done for the next 6 h
      } finally {
        vi.useRealTimers();
      }
    });

    it("an incremental fetch in between does not push the full fetch out", async () => {
      vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-24T08:00:00Z") });
      try {
        const { b, calls, src } = await board();
        src.changed = async () => true;
        for (let h = 1; h <= 5; h++) (vi.advanceTimersByTime(HOUR), await b.refreshAll(false));
        expect(calls.every((c) => c !== null)).toBe(true);
        vi.advanceTimersByTime(HOUR);
        await b.refreshAll(false);
        expect(calls.at(-1)).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it("a failing full fetch keeps the Cards, backs off, and the Board stays in sync incrementally meanwhile", async () => {
      vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-24T08:00:00Z") });
      try {
        const { b, s, calls, waits } = await board();
        vi.advanceTimersByTime(6 * HOUR);
        s.fail = true;
        await b.refreshAll(false);
        expect(calls).toEqual([null]);
        expect(waits()).toBe(true); // the Cards stay as they were
        s.fail = false;
        vi.advanceTimersByTime(15_000);
        await b.refreshAll(false); // inside the back-off: after a failure, an incremental fetch instead of the ETag
        expect(calls).toHaveLength(2);
        expect(calls[1]).not.toBeNull();
        expect(b.view().sync[REPO]!.error).toBeNull();
        vi.advanceTimersByTime(60_000);
        await b.refreshAll(false);
        expect(calls.at(-1)).toBeNull(); // the full fetch is tried again after the back-off
      } finally {
        vi.useRealTimers();
      }
    });

    it("a full fetch keeps a Done Card whose Look waits when it is older than the closed window; one inside the window that vanished is dropped", async () => {
      vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-24T08:00:00Z") });
      try {
        const { b, s } = await board();
        const looks = () => b.view().cards.some((c) => c.number === 108 && c.needsLook);
        expect(looks()).toBe(true);
        s.gone.add(108);
        b.rawIssue(REPO, 108)!.closedAt = new Date(Date.now() - 90 * 24 * HOUR).toISOString(); // GitHub still has it, the window does not reach it
        vi.advanceTimersByTime(6 * HOUR);
        await b.refreshAll(false);
        expect(looks()).toBe(true);
        b.rawIssue(REPO, 108)!.closedAt = new Date(Date.now() - 2 * 24 * HOUR).toISOString(); // inside the window and not fetched: it is gone
        vi.advanceTimersByTime(6 * HOUR);
        await b.refreshAll(false);
        expect(b.rawIssue(REPO, 108)).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it("passes of one repo never overlap: a tick during a slow full fetch waits for it, a forced one runs after it", async () => {
      vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-24T08:00:00Z") });
      try {
        const { b, src } = await board();
        vi.advanceTimersByTime(6 * HOUR);
        const orig = src.fetchIssues;
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        let first = true;
        const started: (string | null)[] = [];
        src.fetchIssues = async (...a) => {
          started.push(a[1]);
          if (first) ((first = false), await gate);
          return orig(...a);
        };
        const p1 = b.refresh(REPO, false);
        const p2 = b.refresh(REPO, false); // the next tick: joins the running pass
        const p3 = b.refresh(REPO, true); // a forced one: after it
        await new Promise((r) => setTimeout(r, 0));
        expect(started).toHaveLength(1);
        release();
        await Promise.all([p1, p2, p3]);
        expect(started).toEqual([null, null]); // the due full fetch once, the forced one once
      } finally {
        vi.useRealTimers();
      }
    });

    it("a cache written before full fetches were stamped gets one right away", async () => {
      process.env.TANDEM_HOME = mkdtempSync(join(tmpdir(), "tandem-nofull-"));
      const st = new Store({ repos: [REPO] });
      const src = new FixtureSource();
      const orig = src.fetchIssues.bind(src);
      const calls: (string | null)[] = [];
      src.fetchIssues = async (repo, since, lookback) => (calls.push(since), orig(repo, since, lookback));
      const ghost = { ...(await orig(REPO, null)).find((i) => i.number === 105)!, number: 423, title: "Visual UI Re-Design" }; // only the cache still has it
      st.saveCache({ [REPO]: { v: CACHE_VERSION, syncedAt: new Date().toISOString(), issues: [...(await orig(REPO, null)), ghost] } }); // no `fullAt`
      const b = new Board(src, st, new FakePusher(new Set()), { pollMs: 60_000, persist: true });
      expect(b.view().cards.some((c) => c.number === 423 && !!c.waiting)).toBe(true);
      await b.start();
      b.stop();
      expect(calls).toEqual([null]);
      expect(b.view().cards.some((c) => c.number === 423)).toBe(false);
      expect(st.loadCache()[REPO]!.fullAt).toBeTruthy();
    });
  });

  it("a quiet poll of cached repos never shows Syncing, so a write's snapshot cannot leave it stuck", async () => {
    const repos = await source.listRepos();
    const st = new Store({ repos });
    const b = new Board(source, st, pusher, { pollMs: 60_000, persist: false });
    await b.refreshAll(true);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    source.changed = async () => (await gate, false);
    const snaps: BoardView[] = [];
    b.subscribe((v) => snaps.push(v));
    const polling = b.refreshAll(false);
    b.patch("acme/app", 105, () => {}); // a write lands mid-poll
    release();
    await polling;
    expect(snaps.length).toBeGreaterThan(0);
    for (const v of snaps) for (const s of Object.values(v.sync)) expect(s.syncing).toBe(false);
  });

  it("marks a repo syncing while its refresh runs", async () => {
    const seen: boolean[] = [];
    board.subscribe((v) => seen.push(v.sync["acme/app"]!.syncing));
    await board.refresh("acme/app", true);
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toContain(false);
    expect(board.view().sync["acme/app"]!.syncing).toBe(false);
  });
});

describe("first opt-in", () => {
  it("counts Done Cards closed before the opt-in as Seen", () => {
    const store = new Store();
    store.setRepos(["acme/app"]);
    expect(store.seenAt("acme/app", 1, "2020-01-01T00:00:00Z")).toBe("2020-01-01T00:00:00Z");
    expect(store.seenAt("acme/app", 1, "2999-01-01T00:00:00Z")).toBeNull();
  });
});

describe("signed screenshot images", () => {
  const roundComment = async () => (await source.fetchIssues("acme/app", null)).find((i) => i.number === 104)!.comments.find((c) => c.body.includes("decision-note round"))!;

  it("aligns the rendered images to the comment's screenshots by alt text", async () => {
    const c = await roundComment();
    source.signedImages = async () => [
      { alt: "R1 · a · mobile", src: "https://private-user-images.githubusercontent.com/1/m.png?jwt=M" },
      { alt: "R1 · a · desktop", src: "https://private-user-images.githubusercontent.com/1/d.png?jwt=D" },
    ];
    const res = await get(`/api/cards/acme/app/104/images?comment=${c.id}`);
    const { srcs, signed } = await res.json();
    expect(signed).toBe(true);
    expect(srcs).toHaveLength(6);
    expect(srcs.slice(0, 2)).toEqual(["https://private-user-images.githubusercontent.com/1/d.png?jwt=D", "https://private-user-images.githubusercontent.com/1/m.png?jwt=M"]);
    expect(srcs[2]).toMatch(/^data:image\/svg\+xml/); // unmatched: own src
  });

  it("falls back to the raw sources when the lookup fails, and never stores the URLs", async () => {
    const c = await roundComment();
    source.signedImages = async () => {
      throw new Error("GitHub GraphQL: rate limited");
    };
    const body = await (await get(`/api/cards/acme/app/104/images?comment=${c.id}`)).json();
    expect(body).toMatchObject({ signed: false, error: expect.stringContaining("rate limited") });
    expect(body.srcs).toHaveLength(6);
    expect(JSON.stringify(await view())).not.toContain("private-user-images");
  });

  it("answers 404 for a comment id that is not on the Card", async () => {
    const res = await get("/api/cards/acme/app/104/images?comment=IC_nope");
    expect(res.status).toBe(404);
    expect((await get("/api/cards/acme/app/104/images")).status).toBe(404);
  });
});

describe("wayfinder issues (#15: the maps view is gone, they stay off the Board)", () => {
  it("an issue labelled wayfinder:map or wayfinder:<kind> is never a Card", async () => {
    const v = await view();
    expect(v.cards.filter((c) => c.repo === "acme/app" && (c.number === 109 || c.number === 121))).toEqual([]);
    expect("maps" in v).toBe(false);
  });
});

describe("fixture reset (E2E: every test starts on boot state)", () => {
  const boot = async (withReset: boolean) => {
    const src = new FixtureSource();
    const st = new Store({ repos: await src.listRepos() }, { memory: true });
    const push = new FakePusher(new Set(["acme/app"]));
    const b = new Board(src, st, push, { pollMs: 60_000, persist: false });
    await b.refreshAll(true);
    const reset = withReset ? fixtureReset({ source: src, store: st, pusher: push, board: b, defaults: { repos: await src.listRepos() } }) : undefined;
    return { a: createApp({ board: b, source: src, store: st, pusher: push, reset, access }), b, st, push };
  };
  /** the parts of the snapshot a test can change; generatedAt and sync times differ per call */
  const state = (b: Board) => {
    const v = b.view();
    return { repos: v.repos, cards: v.cards };
  };

  // demo times are relative to "now": with a frozen clock two boots are identical
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-06T12:00:00Z") }));
  afterEach(() => vi.useRealTimers());

  it("puts the Board back to a fresh boot after writes, a new Issue, Seen, repos and a coordinator", async () => {
    const { a, b, st, push } = await boot(true);
    const before = state(b);
    const call = (path: string, body: unknown = {}, method = "POST") => a.request(path, { method, body: JSON.stringify(body), headers: WRITE });
    await call("/api/cards/acme/app/105/answer", { requestId: "D1", answer: "B" });
    await call("/api/cards/acme/app/101/labels", { add: ["do-not-merge"], remove: ["inbox"] });
    await call("/api/cards/acme/app/108/seen", { seen: true });
    const first = (await (await call("/api/issues", { repo: "acme/app", title: "Captured", body: "x" })).json()).number;
    await call("/api/coordinator/start", { repo: "acme/agent-workflow", numbers: [21] }); // before the repos change drops agent-workflow from the Board
    await call("/api/repos", { repos: ["acme/app"] }, "PUT");
    await call("/api/repos/path", { repo: "acme/app", path: "/tmp/x" }, "PUT");
    expect(state(b)).not.toEqual(before);
    expect(push.sent.length).toBeGreaterThan(0);

    const res = await call("/api/fixture/reset");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(state(b)).toEqual(before);
    expect(st.state).toMatchObject({ seen: {}, repoPaths: {}, repos: before.repos });
    expect(push.sent).toEqual([]);
    expect([...push.live]).toEqual(["acme/app"]);
    // the next created Issue gets the number it would get on a fresh server
    const again = await (await call("/api/issues", { repo: "acme/app", title: "Captured", body: "x" })).json();
    expect(again.number).toBe(first);
  });

  it("emits exactly one snapshot, already the fresh boot, so open pages follow", async () => {
    const { a, b } = await boot(true);
    const fresh = state(b);
    const call = (path: string, body: unknown) => a.request(path, { method: "POST", body: JSON.stringify(body), headers: WRITE });
    await call("/api/cards/acme/app/105/answer", { requestId: "D1", answer: "B" });
    await call("/api/coordinator/start", { repo: "acme/agent-workflow", numbers: [21] });
    await new Promise((r) => setTimeout(r, 0));
    const seen: BoardView[] = [];
    b.subscribe((v) => seen.push(v));
    await a.request("/api/fixture/reset", { method: "POST", body: "{}", headers: WRITE });
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toHaveLength(1);
    expect({ repos: seen[0]!.repos, cards: seen[0]!.cards }).toEqual(fresh);
  });

  it("does not exist without a reset hook (GitHub mode)", async () => {
    const { a } = await boot(false);
    expect((await a.request("/api/fixture/reset", { method: "POST", body: "{}", headers: WRITE })).status).toBe(404);
  });
});

describe("localhost guard (DNS rebinding, CSRF; SECURITY.md)", () => {
  const withHeaders = (over: Record<string, string | undefined>) =>
    Object.fromEntries(Object.entries({ ...WRITE, ...over }).filter((e): e is [string, string] => e[1] !== undefined));
  const issues = () => vi.spyOn(source, "createIssue");

  it("serves reads only to a Host that names this server", async () => {
    expect((await get("/api/board")).status).toBe(200);
    expect((await get("/api/board", { host: "localhost:4317" })).status).toBe(200);
    expect((await get("/api/board", { host: "evil.example:4317" })).status).toBe(403); // a rebound DNS name
    expect((await get("/api/board", { host: "127.0.0.1:9999" })).status).toBe(403);
    expect((await get("/api/repos", { host: "evil.example" })).status).toBe(403);
    expect((await get("/api/board", {})).status).toBe(403); // no Host at all
  });

  it("refuses a write from a foreign Host", async () => {
    const spy = issues();
    const res = await post("/api/issues", { repo: "acme/app", title: "x" }, withHeaders({ host: "evil.example:4317" }));
    expect(res.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
  });

  it("refuses a write from another site's Origin", async () => {
    const spy = issues();
    const res = await post("/api/issues", { repo: "acme/app", title: "x" }, withHeaders({ origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden origin" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("refuses a write without the client header", async () => {
    const spy = issues();
    expect((await post("/api/issues", { repo: "acme/app", title: "x" }, withHeaders({ "x-tandem": undefined }))).status).toBe(403);
    expect((await post("/api/issues", { repo: "acme/app", title: "x" }, withHeaders({ "x-tandem": "0" }))).status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
  });

  it("refuses a preflight-free text/plain or form post", async () => {
    const spy = issues();
    // what a cross-site <form> or no-cors fetch can send: no custom header
    expect((await post("/api/issues", { repo: "acme/app", title: "x" }, { ...HOST, "content-type": "text/plain" })).status).toBe(403);
    // even with the header, the body must be declared JSON
    expect((await post("/api/issues", { repo: "acme/app", title: "x" }, withHeaders({ "content-type": "text/plain;charset=UTF-8" }))).status).toBe(415);
    expect((await post("/api/issues", { repo: "acme/app", title: "x" }, withHeaders({ "content-type": "application/x-www-form-urlencoded" }))).status).toBe(415);
    expect(spy).not.toHaveBeenCalled();
  });

  it("accepts a write from the app's own origin, with or without Origin", async () => {
    expect((await post("/api/issues", { repo: "acme/app", title: "a" }, withHeaders({ origin: "http://127.0.0.1:4317" }))).status).toBe(200);
    expect((await post("/api/issues", { repo: "acme/app", title: "b" }, withHeaders({ origin: "http://localhost:4317", host: "localhost:4317" }))).status).toBe(200);
    expect((await post("/api/issues", { repo: "acme/app", title: "c" }, withHeaders({ "content-type": "application/json; charset=utf-8" }))).status).toBe(200);
  });

  it("lets the Vite dev page write through the proxy only when dev access is on", async () => {
    const devPost = (a: ReturnType<typeof createApp>) =>
      a.request("/api/cards/acme/app/108/seen", { method: "POST", body: "{}", headers: withHeaders({ origin: "http://localhost:5317" }) });
    expect((await devPost(app)).status).toBe(403);
    const dev = createApp({ board, source, store, pusher, access: localAccess(4317, 5317) });
    expect((await devPost(dev)).status).toBe(200);
  });

  it("creates an Issue only in a repo on the Board", async () => {
    const spy = issues();
    for (const repo of ["acme/not-on-board", "someone/else", "../x", 42])
      expect((await post("/api/issues", { repo, title: "x" })).status, String(repo)).toBe(400);
    expect((await post("/api/issues", { repo: "acme/app", title: "" })).status).toBe(400);
    expect((await post("/api/issues", { repo: "acme/app", title: "x", labels: "inbox" })).status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
    const res = await post("/api/issues", { repo: "acme/app", title: "Captured" });
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith("acme/app", "Captured", "", ["inbox"]);
  });

  it("starts a coordinator only for issue numbers in a repo on the Board", async () => {
    const spy = vi.spyOn(pusher, "startCoordinator");
    for (const numbers of [["1 --agent codex"], [0], [-3], [1.5], ["7"], [], "7", null])
      expect((await post("/api/coordinator/start", { repo: "acme/app", numbers })).status, JSON.stringify(numbers)).toBe(400);
    expect((await post("/api/coordinator/start", { repo: "acme/not-on-board", numbers: [1] })).status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
    expect((await post("/api/coordinator/start", { repo: "acme/app", numbers: [105, 106] })).status).toBe(200);
    expect(spy).toHaveBeenCalledWith("acme/app", "/tmp/acme/app", [105, 106]);
  });

  it("checks the repo and number of every card route", async () => {
    const spy = vi.spyOn(source, "comment");
    // a bare %2E%2E segment is normalised away by URL parsing; an encoded slash survives into the param
    for (const path of ["acme/%2e%2e%2fsecrets", "acme/..%2Fsecrets", "%2e%2e%2f%2e%2e/app", "acme/a..b", "ac%20me/app", "acme/kan%3Bdo"])
      expect((await post(`/api/cards/${path}/105/answer`, { requestId: "D1", answer: "B" })).status, path).toBe(400);
    for (const n of ["0", "-1", "1.5", "abc", "1e3"]) expect((await post(`/api/cards/acme/app/${n}/answer`, { requestId: "D1", answer: "B" })).status, n).toBe(400);
    expect((await post("/api/cards/acme/not-on-board/1/answer", { requestId: "D1", answer: "B" })).status).toBe(404);
    expect((await get("/api/cards/acme/%2e%2e%2f%2e%2e%2f.ssh/1/log")).status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it("checks the shapes of the repo and label writes", async () => {
    expect((await post("/api/cards/acme/app/101/labels", { add: "do-not-merge" })).status).toBe(400);
    expect((await post("/api/cards/acme/app/101/labels", { remove: [1] })).status).toBe(400);
    const put = (path: string, body: unknown) => app.request(path, { method: "PUT", body: JSON.stringify(body), headers: WRITE });
    expect((await put("/api/repos", { repos: ["../etc"] })).status).toBe(400);
    expect((await put("/api/repos", { repos: "acme/app" })).status).toBe(400);
    expect((await put("/api/repos/path", { repo: "nope", path: "/tmp" })).status).toBe(400);
    expect((await put("/api/repos/path", { repo: "acme/app", path: 3 })).status).toBe(400);
    expect((await put("/api/repos/path", { repo: "acme/app", path: "/tmp/x" })).status).toBe(200);
  });
});
