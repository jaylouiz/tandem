// Keeps raw GitHub data fresh per opted-in repo and turns it into Board snapshots (ADR 0002).
// Cold start serves the on-disk cache at once; a poll loop asks each repo "changed?" cheaply and
// refetches only issues updated since the last sync.
import { buildCard, isWayfinderIssue, onBoard } from "../core/card.ts";
import { mergeWorkflow, type WorkflowConfig } from "../core/config.ts";
import type { ActivityEntry, BoardSnapshot, BoardView, Card, RawIssue } from "../core/types.ts";
import { readLogActivity, type ActivityReader } from "./activity.ts";
import type { Pusher } from "./push.ts";
import type { Source } from "./source.ts";
import { CACHE_VERSION, type RepoCache, type Store } from "./store.ts";

export type { BoardView };

type Listener = (view: BoardView) => void;

export class Board {
  private cache: Record<string, RepoCache>;
  /** repo -> the current streak of failed passes (`at`: its first failure). Gone with the first pass that works */
  private failures: Record<string, { message: string; at: string; count: number; loud: boolean }> = {};
  /** repo -> the last pass that reached GitHub (a poll that found nothing new counts) */
  private okAt: Record<string, string> = {};
  private syncing = new Set<string>();
  private passes = new Map<string, Promise<void>>();
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private activity: Record<string, ActivityEntry> = {};
  private viewer: string | null = null;
  private emitQueued = false;
  /** reset() holds the snapshots back: its steps would each emit a half-reset Board */
  private muted = false;
  /** repo -> when a due full fetch may run again; a failing one backs off instead of retrying every tick */
  private fullBackoff = new Map<string, { until: number; delay: number }>();

  constructor(
    private source: Source,
    private store: Store,
    private pusher: Pusher,
    private opts: { pollMs: number; persist: boolean; activity?: ActivityReader } = { pollMs: 15_000, persist: true },
  ) {
    this.cache = opts.persist ? store.loadCache() : {};
  }

  get workflow(): WorkflowConfig {
    return mergeWorkflow(this.store.state.workflow);
  }

  async start() {
    this.source.viewer().then((v) => (this.viewer = v)).catch(() => {});
    // a cache makes the first pass incremental (cheap "changed?" check); only an empty cache pays the full fetch
    await this.refreshAll(false);
    await this.refreshActivity();
    this.timer = setInterval(() => void this.tick(), this.opts.pollMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    await this.refreshAll(false);
    await this.refreshActivity();
  }

  /** Re-read the coordination logs of in-flight Cards; emits only when a last line changed. */
  async refreshActivity() {
    const before = JSON.stringify(this.activity);
    this.activity = await (this.opts.activity ?? readLogActivity)(this.view().cards);
    if (JSON.stringify(this.activity) !== before) this.emit();
  }

  async refreshAll(force: boolean) {
    await Promise.all(this.store.state.repos.map((r) => this.refresh(r, force)));
  }

  /**
   * Fetch a repo when it changed (or `force`), merging updated issues into the cache.
   *
   * Three kinds of pass:
   * - quiet poll: ask "changed?" (ETag), fetch the issues updated since the last sync only when it says yes;
   * - full fetch: replaces the repo's cache, so an issue GitHub no longer has (deleted, transferred, the repo recreated) leaves
   *   the Board (#16). Run when there is no cache, on `force`, for a cache of an older shape, and every `fullSyncHours`;
   * - after a failure: the ETag is not trusted (GitHub's answer may have been stored for a change whose fetch then failed),
   *   so the next poll fetches what changed since the last good sync, and its success clears the error (#2).
   */
  async refresh(repo: string, force = false): Promise<void> {
    // one pass per repo at a time: a tick that finds one running joins it, a forced refresh runs after it, so an older read never
    // writes back over a newer one (a slow full fetch outlasts the 15 s tick)
    const running = this.passes.get(repo);
    if (running && !force) return running;
    const pass = (running ? running.catch(() => {}) : Promise.resolve()).then(() => this.pass(repo, force));
    this.passes.set(repo, pass);
    try {
      await pass;
    } finally {
      if (this.passes.get(repo) === pass) this.passes.delete(repo);
    }
  }

  private async pass(repo: string, force: boolean) {
    const cached = this.cache[repo];
    // a cache from before the current sync fields lacks them: one full fetch fills them in, and until it does the cache is not current
    const oldShape = !!cached && cached.v !== CACHE_VERSION;
    const fullDue = !!cached && (oldShape || !cached.fullAt || Date.now() - Date.parse(cached.fullAt) >= this.workflow.fullSyncHours * 3_600_000);
    // a failing full fetch backs off (1 min, doubling to 30), and polls in between stay incremental
    const backedOff = fullDue && (this.fullBackoff.get(repo)?.until ?? 0) > Date.now();
    const full = force || !cached || (fullDue && !backedOff);
    // only a refresh the developer waits for (forced, no cache yet, an old-shaped cache) shows as Syncing: a quiet poll or a scheduled full
    // fetch would otherwise leave the flag set in any snapshot emitted before it ends, with no emit after the "unchanged" path
    const loud = force || !cached || (oldShape && !backedOff);
    if (loud) {
      this.syncing.add(repo);
      this.emit();
    }
    let changed = loud;
    try {
      // an old-shaped cache in back-off keeps the cheap ETag path (its failure stays reported until the full fetch works)
      const trustEtag = oldShape || !this.failures[repo];
      if (cached && !full && trustEtag && !(await this.source.changed(repo))) {
        if (!oldShape) changed = this.recovered(repo) || changed;
        return;
      }
      const started = new Date().toISOString();
      // a minute of overlap so an update racing the last sync is not missed
      const since = cached && !full ? new Date(Date.parse(cached.syncedAt) - 60_000).toISOString() : null;
      const fresh = await this.source.fetchIssues(repo, since, this.workflow.closedLookbackDays);
      const merged = new Map((since ? (cached?.issues ?? []) : []).map((i) => [i.number, i]));
      for (const i of fresh) merged.set(i.number, i);
      // a full fetch lists open issues and those closed within the window: a Done Card older than that whose Look still waits is not
      // vanished, the window just does not reach it, so it stays until it is Seen (an absent one inside the window is gone)
      if (!since) {
        const cutoff = Date.now() - this.workflow.closedLookbackDays * 86_400_000;
        for (const i of cached?.issues ?? []) {
          if (merged.has(i.number) || i.state !== "closed" || !i.closedAt || Date.parse(i.closedAt) >= cutoff) continue;
          const card = buildCard(i, this.workflow, this.store.seenAt(repo, i.number, i.closedAt));
          if (card.needsLook && !card.seenAt) merged.set(i.number, i);
        }
      }
      // only a full fetch makes an old-shaped cache current, and only it counts as a reconcile; merged onto the cache, vanished issues stay
      this.cache[repo] = { v: since ? cached!.v : CACHE_VERSION, fullAt: since ? cached!.fullAt : started, syncedAt: started, issues: [...merged.values()] };
      if (!since) this.fullBackoff.delete(repo);
      // an incremental merge onto an old-shaped cache is no recovery: the failing full refetch stays reported
      if (this.cache[repo]!.v === CACHE_VERSION) this.recovered(repo);
      if (this.opts.persist) this.store.saveCache(this.cache);
      changed = true;
    } catch (e) {
      const before = this.failures[repo];
      // shown from the second failed poll in a row: one blip heals on the next tick. A fetch the developer waits for reports at once
      this.failures[repo] = { message: e instanceof Error ? e.message : String(e), at: before?.at ?? new Date().toISOString(), count: (before?.count ?? 0) + 1, loud: loud || !!before?.loud };
      if (fullDue && full) {
        const delay = Math.min((this.fullBackoff.get(repo)?.delay ?? 30_000) * 2, 30 * 60_000);
        this.fullBackoff.set(repo, { until: Date.now() + delay, delay });
      }
      changed = true;
    } finally {
      if (loud) this.syncing.delete(repo);
      if (changed) this.emit();
    }
  }

  /** A pass that worked: the repo is reachable again. Returns whether there was a failure to clear. */
  private recovered(repo: string) {
    this.okAt[repo] = new Date().toISOString();
    if (!this.failures[repo]) return false;
    delete this.failures[repo];
    return true;
  }

  /** Back to a cold start (fixture/E2E): drop everything synced, read the source again, then tell the listeners once. */
  async reset() {
    this.muted = true;
    try {
      this.cache = {};
      this.failures = {};
      this.okAt = {};
      this.syncing.clear();
      this.fullBackoff.clear();
      await this.refreshAll(true);
      await this.refreshActivity();
    } finally {
      this.muted = false;
    }
    this.emit();
  }

  /** Apply a write to the cached copy at once, so the Board reflects it before GitHub is re-read. */
  patch(repo: string, number: number, fn: (i: RawIssue) => void) {
    const issue = this.cache[repo]?.issues.find((i) => i.number === number);
    if (issue) {
      fn(issue);
      issue.updatedAt = new Date().toISOString();
    }
    this.emit();
  }

  addIssue(issue: RawIssue) {
    (this.cache[issue.repo] ??= { v: CACHE_VERSION, fullAt: new Date(0).toISOString(), syncedAt: new Date(0).toISOString(), issues: [] }).issues.push(issue);
    this.emit();
  }

  rawIssue(repo: string, number: number) {
    return this.cache[repo]?.issues.find((i) => i.number === number) ?? null;
  }

  card(repo: string, number: number): Card | null {
    const i = this.rawIssue(repo, number);
    return i ? buildCard(i, this.workflow, this.store.seenAt(repo, number, i.closedAt)) : null;
  }

  view(): BoardView {
    const cfg = this.workflow;
    const now = new Date();
    const cards: Card[] = [];
    const sync: BoardSnapshot["sync"] = {};
    for (const repo of this.store.state.repos) {
      const c = this.cache[repo];
      const f = this.failures[repo];
      const shown = f && (f.count >= 2 || f.loud) ? f : null;
      sync[repo] = { at: c?.syncedAt ?? null, okAt: this.okAt[repo] ?? c?.syncedAt ?? null, error: shown?.message ?? null, errorAt: shown?.at ?? null, syncing: this.syncing.has(repo) };
      for (const i of c?.issues ?? []) {
        if (isWayfinderIssue(i, cfg)) continue;
        const card = buildCard(i, cfg, this.store.seenAt(repo, i.number, i.closedAt));
        if (onBoard(card, cfg, now)) cards.push(card);
      }
    }
    return {
      generatedAt: now.toISOString(),
      repos: this.store.state.repos,
      cards,
      sync,
      viewer: this.viewer,
      workflow: cfg,
      source: this.source.kind,
      activity: this.activity,
    };
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Coalesce bursts of changes into one snapshot per tick. */
  emit() {
    if (this.emitQueued) return;
    this.emitQueued = true;
    queueMicrotask(() => {
      this.emitQueued = false;
      if (this.muted) return;
      const v = this.view();
      for (const l of this.listeners) l(v);
    });
  }
}
