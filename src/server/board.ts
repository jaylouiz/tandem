// Keeps raw GitHub data fresh per opted-in repo and turns it into Board snapshots (ADR 0002).
// Cold start serves the on-disk cache at once; a poll loop asks each repo "changed?" cheaply and
// refetches only issues updated since the last sync.
import { buildCard, onBoard } from "../core/card.ts";
import { isWayfinderIssue, buildMaps } from "../core/wayfinder.ts";
import { mergeWorkflow, type WorkflowConfig } from "../core/config.ts";
import type { ActivityEntry, BoardSnapshot, BoardView, Card, Coordinator, RawIssue } from "../core/types.ts";
import { readLogActivity, type ActivityReader } from "./activity.ts";
import type { Pusher } from "./push.ts";
import type { Source } from "./source.ts";
import { CACHE_VERSION, type RepoCache, type Store } from "./store.ts";

export type { BoardView };

type Listener = (view: BoardView) => void;

export class Board {
  private cache: Record<string, RepoCache>;
  private errors: Record<string, string | null> = {};
  private syncing = new Set<string>();
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private coordinators: Record<string, Coordinator> = {};
  private activity: Record<string, ActivityEntry> = {};
  private viewer: string | null = null;
  private emitQueued = false;
  /** reset() holds the snapshots back: its steps would each emit a half-reset Board */
  private muted = false;
  /** repo -> when its stale-cache full refetch may run again; a failing one backs off instead of retrying every tick */
  private staleBackoff = new Map<string, { until: number; delay: number }>();

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
    const before = JSON.stringify(this.coordinators);
    this.coordinators = await this.pusher.coordinators();
    if (JSON.stringify(this.coordinators) !== before) this.emit();
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

  /** Fetch a repo when it changed (or `force`), merging updated issues into the cache. */
  async refresh(repo: string, force = false) {
    // only a loud refresh (forced, or no cache yet) shows as Syncing; a quiet poll of a cached repo would
    // otherwise leave the flag set in any snapshot emitted before it ends, with no emit after the "unchanged" path
    // a cache from before the current sync fields lacks them (e.g. a ticket's `parent`): one full fetch fills them in
    // a failing refetch backs off (1 min, doubling to 30), and polls in between take the quiet ETag path
    const stale = !!this.cache[repo] && this.cache[repo]!.v !== CACHE_VERSION;
    const backedOff = stale && (this.staleBackoff.get(repo)?.until ?? 0) > Date.now();
    force ||= stale && !backedOff;
    const loud = force || !this.cache[repo];
    if (loud) {
      this.syncing.add(repo);
      this.emit();
    }
    try {
      const cached = this.cache[repo];
      if (cached && !force && !(await this.source.changed(repo))) return;
      const started = new Date().toISOString();
      // a minute of overlap so an update racing the last sync is not missed
      const since = cached && !force ? new Date(Date.parse(cached.syncedAt) - 60_000).toISOString() : null;
      const fresh = await this.source.fetchIssues(repo, since, this.workflow.closedLookbackDays);
      const merged = new Map((since ? (cached?.issues ?? []) : []).map((i) => [i.number, i]));
      for (const i of fresh) merged.set(i.number, i);
      // only a full fetch makes an old-shaped cache current; merged onto it, the old issues still lack the new fields
      this.cache[repo] = { v: since ? cached!.v : CACHE_VERSION, syncedAt: started, issues: [...merged.values()] };
      if (!since) this.staleBackoff.delete(repo);
      // an incremental merge onto an old-shaped cache is no recovery: the failing full refetch stays reported
      if (this.cache[repo]!.v === CACHE_VERSION) this.errors[repo] = null;
      if (this.opts.persist) this.store.saveCache(this.cache);
    } catch (e) {
      this.errors[repo] = e instanceof Error ? e.message : String(e);
      if (stale && force) {
        const delay = Math.min((this.staleBackoff.get(repo)?.delay ?? 30_000) * 2, 30 * 60_000);
        this.staleBackoff.set(repo, { until: Date.now() + delay, delay });
      }
    } finally {
      if (loud) this.syncing.delete(repo);
    }
    this.emit();
  }

  /** Back to a cold start (fixture/E2E): drop everything synced, read the source again, then tell the listeners once. */
  async reset() {
    this.muted = true;
    try {
      this.cache = {};
      this.errors = {};
      this.syncing.clear();
      this.staleBackoff.clear();
      await this.refreshAll(true);
      await this.refreshCoordinators();
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
    (this.cache[issue.repo] ??= { v: CACHE_VERSION, syncedAt: new Date(0).toISOString(), issues: [] }).issues.push(issue);
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
    const all = this.store.state.repos.flatMap((repo) => this.cache[repo]?.issues ?? []);
    // maps read the whole cache: a blocker or sub-issue need not carry a wayfinder label
    const maps = buildMaps(all, cfg);
    const tickets = new Set(maps.flatMap((m) => m.tickets.map((t) => `${m.repo}#${t.number}`)));
    for (const repo of this.store.state.repos) {
      const c = this.cache[repo];
      sync[repo] = { at: c?.syncedAt ?? null, error: this.errors[repo] ?? null, syncing: this.syncing.has(repo) };
      for (const i of c?.issues ?? []) {
        if (isWayfinderIssue(i, cfg) || tickets.has(`${repo}#${i.number}`)) continue;
        const card = buildCard(i, cfg, this.store.seenAt(repo, i.number, i.closedAt));
        if (onBoard(card, cfg, now)) cards.push(card);
      }
    }
    return {
      generatedAt: now.toISOString(),
      repos: this.store.state.repos,
      cards,
      maps,
      sync,
      viewer: this.viewer,
      workflow: cfg,
      source: this.source.kind,
      coordinators: this.coordinators,
      activity: this.activity,
    };
  }

  async refreshCoordinators() {
    this.coordinators = await this.pusher.coordinators();
    this.emit();
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
