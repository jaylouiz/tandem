// Push: tell the running /orchestrate-gh-issues coordinator that Feedback arrived or a Card should start
// (ADR 0003). Tandem never types into terminals and never runs agents itself; it only sends an Orca
// orchestration message to the coordinator's Run, or launches a coordinator when the developer asks.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { NO_COORDINATOR, type Coordinator } from "../core/types.ts";
export type { Coordinator };

export type PushEvent = "feedback" | "start";

export interface PushResult {
  delivered: boolean;
  runId: string | null;
  reason: string | null;
}

export interface Pusher {
  coordinators(): Promise<Record<string, Coordinator>>;
  /** local checkout paths Orca knows, per repo (to start a coordinator) */
  knownPaths(): Promise<Record<string, string>>;
  push(repo: string, number: number, event: PushEvent, text: string): Promise<PushResult>;
  startCoordinator(repo: string, path: string, numbers: number[]): Promise<void>;
}

/** Subject line a coordinator matches on: `tandem push: <owner/repo>#<n> <feedback|start>`. */
export const pushSubject = (repo: string, n: number, event: PushEvent) => `tandem push: ${repo}#${n} ${event}`;

export function pushBody(repo: string, n: number, event: PushEvent, text: string) {
  return event === "feedback"
    ? `Feedback given on ${repo}#${n} (${text}). Sweep \`decide.sh status\` and resume the issue as for an answered decision.`
    : `The developer handed ${repo}#${n} to the agents: start its Next step (${text}) per the triage lane.`;
}

function slugFromRemote(url: string): string | null {
  const m = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(url.trim());
  return m ? m[1]! : null;
}

/** The `orca` binary: injectable so tests never call the real one. */
export type Exec = (cmd: string, args: string[], opts?: { timeout?: number }) => Promise<{ stdout: string }>;

async function orca<T>(run: Exec, args: string[]): Promise<T> {
  const { stdout } = await run("orca", [...args, "--json"], { timeout: 15_000 });
  const parsed = JSON.parse(stdout) as { ok: boolean; result: T; error?: { message: string } };
  if (!parsed.ok) throw new Error(parsed.error?.message ?? `orca ${args.join(" ")} failed`);
  return parsed.result;
}

const reasonOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface Detected {
  at: number;
  value: Record<string, Coordinator>;
  paths: Record<string, string>;
  /** set when this is not a complete answer about now (Orca unreachable, or a Run could not be read): "none for a repo" is then not known */
  problem?: string;
}

const FRESH_MS = 15_000;
/** a lookup that could not finish is tried again this soon (not after FRESH_MS) */
const RETRY_MS = 2_000;
/** when Orca cannot be asked, the last answer stands this long: "could not ask" is not "none running" */
const STALE_MS = 120_000;

/**
 * The one coordinator detection: the Board (Card pane, Awaiting pickup, Start coordinator) and Push both read `detected()`,
 * so they cannot disagree. A lookup that fails keeps the last answer instead of turning into "none running".
 */
export class OrcaPusher implements Pusher {
  private cache: Detected | null = null;
  private inflight: Promise<Detected> | null = null;
  private slugs = new Map<string, string | null>();
  /** run id -> its coordinator's terminal handle; fixed for a Run's life, so it is asked once (run-show is one `orca` call per Run) */
  private handles = new Map<string, string>();

  constructor(private run: Exec = promisify(execFile) as Exec) {}

  private async slug(path: string) {
    if (!this.slugs.has(path)) {
      try {
        const { stdout } = await this.run("git", ["-C", path, "remote", "get-url", "origin"]);
        this.slugs.set(path, slugFromRemote(stdout));
      } catch {
        this.slugs.set(path, null);
      }
    }
    return this.slugs.get(path) ?? null;
  }

  /** Ask Orca. Throws when it cannot be asked at all; a Run it cannot read keeps its previous answer. */
  private async detect(): Promise<Detected> {
    const terms = await orca<{ terminals: { handle: string; connected: boolean; worktreePath: string }[] }>(this.run, ["terminal", "list"]);
    const paths: Record<string, string> = {};
    for (const t of terms.terminals) {
      const s = await this.slug(t.worktreePath);
      // the main checkout, not an Orca worktree, is where a coordinator belongs
      if (s && (!paths[s] || t.worktreePath.length < paths[s]!.length)) paths[s] = t.worktreePath;
    }
    const live = new Map(terms.terminals.filter((t) => t.connected).map((t) => [t.handle, t]));
    const runs = await orca<{ runs: { id: string }[] }>(this.run, ["orchestration", "run-list"]);
    const value: Record<string, Coordinator> = {};
    let unread: string | undefined;
    for (const r of runs.runs) {
      // run-list is newest first: the first live Run per repo wins
      let handle = this.handles.get(r.id);
      if (!handle) {
        // the concise view omits the run record; --full carries coordinator_handle
        let failure: unknown;
        const show = await orca<{ run?: { coordinator_handle?: string | null } }>(this.run, ["orchestration", "run-show", "--id", r.id, "--full"]).catch((e) => ((failure = e), undefined));
        if (show === undefined) {
          unread ??= `could not read Orca Run ${r.id}: ${reasonOf(failure)}`;
          // could not read this Run: what we knew about it stands while its terminal is still there
          const known = Object.values(this.cache?.value ?? {}).find((c) => c.runId === r.id && live.has(c.terminal));
          if (known && !value[known.repo]) value[known.repo] = known;
          continue;
        }
        handle = show.run?.coordinator_handle ?? undefined;
        if (handle) this.handles.set(r.id, handle);
      }
      const t = handle ? live.get(handle) : undefined;
      if (!t) continue;
      const repo = await this.slug(t.worktreePath);
      if (repo && !value[repo]) value[repo] = { runId: r.id, repo, terminal: t.handle, worktreePath: t.worktreePath };
    }
    return { at: unread ? Date.now() - FRESH_MS + RETRY_MS : Date.now(), value, paths, problem: unread };
  }

  /** The current answer. One lookup at a time; `fresh` skips the cache. A last answer that stands in for a failed lookup carries `problem`. Throws only when Orca cannot be asked and there is no recent answer. */
  private detected(fresh = false): Promise<Detected> {
    if (!fresh && this.cache && Date.now() - this.cache.at < FRESH_MS) return Promise.resolve(this.cache);
    this.inflight ??= this.detect()
      .then(
        (d) => (this.cache = d),
        (e) => {
          if (this.cache && Date.now() - this.cache.at < STALE_MS) return { ...this.cache, problem: `could not reach Orca: ${reasonOf(e)}` };
          throw e;
        },
      )
      .finally(() => (this.inflight = null));
    return this.inflight;
  }

  async coordinators() {
    try {
      return (await this.detected()).value;
    } catch {
      return {}; // Orca not running: nothing to push to
    }
  }

  async knownPaths() {
    try {
      return (await this.detected()).paths;
    } catch {
      return {};
    }
  }

  async push(repo: string, number: number, event: PushEvent, text: string): Promise<PushResult> {
    let d: Detected;
    try {
      d = await this.detected();
      // none in the cache: ask Orca once more before telling the developer nobody is there
      if (!d.value[repo]) d = await this.detected(true);
    } catch (e) {
      return { delivered: false, runId: null, reason: `could not reach Orca: ${reasonOf(e)}` };
    }
    const c = d.value[repo];
    // "no coordinator running" only from a complete answer: a stale or partial one cannot rule a coordinator out
    if (!c) return { delivered: false, runId: null, reason: d.problem ?? NO_COORDINATOR };
    await orca(this.run, ["orchestration", "send", "--to", `run:${c.runId}`, "--type", "status", "--subject", pushSubject(repo, number, event), "--body", pushBody(repo, number, event, text)]);
    return { delivered: true, runId: c.runId, reason: null };
  }

  async startCoordinator(repo: string, path: string, numbers: number[]) {
    this.cache = null;
    await orca(this.run, ["agent", "launch", "--agent", "claude", "--worktree", `path:${path}`, "--prompt", `/orchestrate-gh-issues ${numbers.map((n) => `#${n}`).join(" ")}`]);
  }
}

/** Test and demo double: records pushes; a coordinator exists for the repos in `live`. */
export class FakePusher implements Pusher {
  sent: { repo: string; number: number; event: PushEvent; text: string }[] = [];
  private initial: string[];
  constructor(public live = new Set<string>()) {
    this.initial = [...live];
  }
  /** Back to the boot state: the starting coordinators, nothing sent. */
  reset() {
    this.live = new Set(this.initial);
    this.sent = [];
  }
  async coordinators() {
    return Object.fromEntries([...this.live].map((repo) => [repo, { runId: `run_fake_${repo}`, repo, terminal: "term_fake", worktreePath: `/tmp/${repo}` }]));
  }
  async knownPaths() {
    return Object.fromEntries([...this.live].map((repo) => [repo, `/tmp/${repo}`]));
  }
  async push(repo: string, number: number, event: PushEvent, text: string): Promise<PushResult> {
    if (!this.live.has(repo)) return { delivered: false, runId: null, reason: NO_COORDINATOR };
    this.sent.push({ repo, number, event, text });
    return { delivered: true, runId: `run_fake_${repo}`, reason: null };
  }
  async startCoordinator(repo: string) {
    this.live.add(repo);
  }
}
