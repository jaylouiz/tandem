// Client state: the server's Board snapshot (live over SSE) plus optimistic patches for writes in flight.
import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { toLookAt, waitingOnMe } from "../core/card.ts";
import { pruneDrafts, type Draft } from "../core/drafts.ts";
import type { ShotsTarget } from "../core/gallery.ts";
import { nextAfterAnswer } from "./answered.ts";
import { navigation, parseRoute, VIEWS, type Nav } from "./route.ts";
import { closeToast } from "./ui/Toast.tsx";
import { pruneHanded, type HandedRecord } from "../core/triage.ts";
import { NO_COORDINATOR, type ActivityEntry, type BoardView, type Card, type Coordinator, type NextStep, type Phase, type WayfinderMap } from "../core/types.ts";

export type View = "waiting" | "board" | "maps" | "settings";
/** The views that list Cards: only there the Card keys and the Selection bar are live (Maps and Settings have none to act on). */
export const showsCards = (v: View) => v === "waiting" || v === "board";
export type Tab = "now" | "decided" | "activity" | "issue";
export type Modal = "palette" | "capture" | "agents" | "shortcuts";

/** Opening a modal replaces the open one; closing one that is no longer the open one (the Palette's command opened another) leaves it alone. */
const modalPatch = (s: { modal: Modal | null }, name: Modal, open: boolean): { modal: Modal | null } | {} => (open ? (s.modal === name ? {} : { modal: name }) : s.modal === name ? { modal: null } : {});
export const TABS: { id: Tab; label: string }[] = [
  { id: "now", label: "Now" },
  { id: "decided", label: "Decided" },
  { id: "activity", label: "Activity" },
  { id: "issue", label: "Issue" },
];

// zustand selectors must never return a fresh []/{} literal (it re-renders forever): empty values live here
export const NO_REPOS: string[] = [];
export const NO_COORDINATORS: Record<string, Coordinator> = {};
export const NO_ACTIVITY: Record<string, ActivityEntry> = {};
const NO_FAILURES: Record<string, string> = {};
const NO_DRAFTS: Record<string, Draft> = {};
export const NO_HANDED: Record<string, HandedRecord> = {};

export { draftKey } from "../core/drafts.ts";
const NO_DAYS: Record<string, boolean> = {};
const NO_LANES: Record<string, boolean> = {};
const LANES_KEY = "tandem.lanes";

/** What the developer is told after an action. `setNotice` keeps the latest one here and shows it as a toast (`notices.ts`); the toast stack, its Undo and ⌘Z live in `ui/Toast.tsx`. */
export interface PushNotice {
  key: string;
  text: string;
  canStart: boolean;
  /** it went wrong (wholly or in part): the toast stays until dismissed and is announced as an alert */
  failed?: boolean;
  /** work still running ("Refreshing…"): no timer; a later notice with the same `id` replaces it in place */
  busy?: boolean;
  id?: string;
  /** the Cards the "Start coordinator" button starts one for (default: the notice's own Card) */
  start?: Card[];
  /** a move's Undo button: writes the inverse change (a failure says so in a new notice) */
  undo?: () => void;
}

/** A pointer drag of Cards in flight (the Board's drag layer): their keys, the pointer and the Phase column under it. */
export interface DragState {
  keys: string[];
  x: number;
  y: number;
  over: Phase | null;
  /** grouped by repo: the repo of the lane under the pointer (null on the head row or outside the Board) */
  lane: string | null;
}

export interface ShotsRequest {
  id: number;
  key: string;
  target: ShotsTarget;
}

interface State {
  board: BoardView | null;
  connected: boolean;
  view: View;
  repoFilter: string | null;
  selected: string | null;
  /** the Card pane's tab; resets to Now whenever another Card is selected (unless `select` names one) */
  tab: Tab;
  setTab: (t: Tab) => void;
  /** the one modal dialog that is open (Palette, Capture, Agent activity, Shortcuts): one at a time, opening another replaces it. The Gallery is local to the Card pane and blocks these keys through `ui/Dialog` */
  modal: Modal | null;
  setAgentsOpen: (o: boolean) => void;
  /** card key -> why its last Feedback was not sent (the optimistic patch was rolled back) */
  failures: Record<string, string>;
  fail: (key: string, message: string) => void;
  clearFailure: (key: string) => void;
  /** `draftKey` (Card + request id) -> what a Feedback panel holds that was not sent: kept while typing, until the answer went through or its request is gone */
  drafts: Record<string, Draft>;
  /** merges `patch` into the draft */
  setDraft: (key: string, patch: Draft) => void;
  clearDraft: (key: string) => void;
  /** Board Done column: days the developer expanded (day -> open) */
  openDays: Record<string, boolean>;
  toggleDay: (day: string, open?: boolean) => void;
  /** Board "Group by repo" (#36): remembered in the browser like the last view; collapsed lanes (repo -> true) are per session */
  lanes: boolean;
  setLanes: (on: boolean) => void;
  collapsedLanes: Record<string, boolean>;
  toggleLane: (repo: string) => void;
  /** card key -> patch applied over the server's card until the next snapshot that reflects the write */
  pending: Record<string, Partial<Card>>;
  notice: PushNotice | null;
  /** card key -> a Push the coordinator has not picked up yet; only a bridge until GitHub shows it (`handedValid`) */
  handed: Record<string, HandedRecord>;
  markHanded: (cards: Card[]) => void;
  clearHanded: (keys: string[]) => void;
  /** Cards marked for bulk triage (keys); not persisted */
  marked: string[];
  toggleMark: (key: string) => void;
  setMarks: (keys: string[]) => void;
  clearMarks: () => void;
  /** the Next step Move to Backlog gives (button, key and drop): "keep" = each Card's own, else specify */
  moveStep: NextStep | "keep";
  setMoveStep: (s: NextStep | "keep") => void;
  drag: DragState | null;
  setDrag: (d: DragState | null) => void;
  /** set by the palette: the Card and panel whose screenshots to open; `id` changes on every request */
  shotsRequest: ShotsRequest | null;
  requestShots: (key: string, target: ShotsTarget) => void;
  /** Waiting on me: the Card the developer opened out of To look at (and so marked Seen); it stays listed until another Card is opened or the view changes */
  linger: string | null;
  setLinger: (key: string | null) => void;
  /** switching view starts the page with nothing open and nothing marked (#30); a new history entry unless `nav` says "replace" (#48) */
  setView: (v: View, nav?: Nav) => void;
  /** Open (or close, null) a Card. `opts.nav`: the history entry a deliberate open pushes ("push"), anything automatic replaces (default); `opts.view` opens it in another view in the same step (#48) */
  select: (key: string | null, tab?: Tab, opts?: SelectOpts) => void;
  setRepoFilter: (r: string | null) => void;
  setPalette: (o: boolean) => void;
  setCapture: (o: boolean) => void;
  setShortcuts: (o: boolean) => void;
  setNotice: (n: PushNotice | null) => void;
  optimistic: (key: string, patch: Partial<Card>) => void;
}

export interface SelectOpts {
  nav?: Nav;
  view?: View;
}

const FILTER_KEY = "tandem.repoFilter";
const VIEW_KEY = "tandem.view";

/** The view the page was last on (`/` opens it). */
export const storedView = (): View => {
  try {
    const v = localStorage.getItem(VIEW_KEY) as View | null;
    return v && VIEWS.includes(v) ? v : "waiting";
  } catch {
    return "waiting";
  }
};

/** The remembered Repo filter, or null when that repo is no longer on the Board (an unlisted repo would show an empty Board under a chip nobody set). */
export const validFilter = (filter: string | null, repos: string[]): string | null => (filter && repos.includes(filter) ? filter : null);

export function storeFilter(repo: string | null) {
  if (repo) localStorage.setItem(FILTER_KEY, repo);
  else localStorage.removeItem(FILTER_KEY);
}

/**
 * Where the page starts: what the URL says (a Card link, a reload, a notification), else the remembered view and Repo filter.
 * The URL's own filter wins even when empty: `/board` shows every repo (#48).
 */
function startingPlace(): { view: View; selected: string | null; tab: Tab; repoFilter: string | null } {
  const r = typeof location === "undefined" ? null : parseRoute(location.pathname, location.search);
  const remembered = localStorage.getItem(FILTER_KEY);
  if (!r?.view) return { view: storedView(), selected: null, tab: "now", repoFilter: r?.repoFilter ?? remembered };
  return { view: r.view, selected: r.selected, tab: r.tab, repoFilter: r.repoFilter };
}
const start = startingPlace();
try {
  localStorage.setItem(VIEW_KEY, start.view);
  storeFilter(start.repoFilter);
} catch {}

export const useStore = create<State>((set) => ({
  board: null,
  connected: false,
  view: start.view,
  repoFilter: start.repoFilter,
  selected: start.selected,
  linger: null,
  setLinger: (linger) => set({ linger }),
  tab: start.tab,
  setTab: (tab) => set({ tab }),
  modal: null,
  setAgentsOpen: (o) => set((s) => modalPatch(s, "agents", o)),
  failures: NO_FAILURES,
  fail: (key, message) => set((s) => ({ failures: { ...s.failures, [key]: message } })),
  clearFailure: (key) =>
    set((s) => {
      if (!(key in s.failures)) return {};
      const { [key]: _, ...rest } = s.failures;
      return { failures: Object.keys(rest).length ? rest : NO_FAILURES };
    }),
  drafts: NO_DRAFTS,
  setDraft: (id, patch) => set((s) => ({ drafts: { ...s.drafts, [id]: { ...s.drafts[id], ...patch } } })),
  clearDraft: (id) =>
    set((s) => {
      if (!(id in s.drafts)) return {};
      const { [id]: _, ...rest } = s.drafts;
      return { drafts: Object.keys(rest).length ? rest : NO_DRAFTS };
    }),
  openDays: NO_DAYS,
  toggleDay: (day, open) => set((s) => ({ openDays: { ...s.openDays, [day]: open ?? !s.openDays[day] } })),
  lanes: localStorage.getItem(LANES_KEY) === "1",
  setLanes: (lanes) => {
    try {
      localStorage.setItem(LANES_KEY, lanes ? "1" : "0");
    } catch {}
    set({ lanes });
  },
  collapsedLanes: NO_LANES,
  toggleLane: (repo) => set((s) => ({ collapsedLanes: { ...s.collapsedLanes, [repo]: !s.collapsedLanes[repo] } })),
  pending: {},
  notice: null,
  handed: NO_HANDED,
  markHanded: (cards) =>
    set((s) => {
      const at = Date.now();
      const add = cards.filter((c) => c.nextStep).map((c) => [c.key, { at, nextStep: c.nextStep! }] as const);
      return add.length ? { handed: { ...s.handed, ...Object.fromEntries(add) } } : {};
    }),
  clearHanded: (keys) =>
    set((s) => {
      const rest = Object.fromEntries(Object.entries(s.handed).filter(([k]) => !keys.includes(k)));
      return Object.keys(rest).length === Object.keys(s.handed).length ? {} : { handed: Object.keys(rest).length ? rest : NO_HANDED };
    }),
  marked: [],
  toggleMark: (key) => set((s) => ({ marked: s.marked.includes(key) ? s.marked.filter((k) => k !== key) : [...s.marked, key] })),
  setMarks: (marked) => set({ marked }),
  clearMarks: () => set((s) => (s.marked.length ? { marked: [] } : {})),
  moveStep: "keep",
  setMoveStep: (moveStep) => set({ moveStep }),
  drag: null,
  setDrag: (drag) => set({ drag }),
  shotsRequest: null,
  requestShots: (key, target) => set((s) => ({ shotsRequest: { id: (s.shotsRequest?.id ?? 0) + 1, key, target } })),
  setView: (view, nav = "push") => {
    localStorage.setItem(VIEW_KEY, view);
    navigation.hint = nav;
    // every page starts with the Card pane closed; the same view again keeps what is open
    set((s) => (view === s.view ? {} : { view, selected: null, tab: "now", linger: null, marked: s.marked.length ? [] : s.marked }));
  },
  select: (selected, tab, opts = {}) => {
    navigation.hint = opts.nav ?? "replace";
    if (opts.view) localStorage.setItem(VIEW_KEY, opts.view);
    set((s) => {
      const view = opts.view && opts.view !== s.view ? opts.view : null;
      if (tab === undefined && selected === s.selected && !view) return {};
      // a Card picked from elsewhere (palette, notification, activity) in a collapsed lane opens its lane, like Done opens its day (#36)
      const repo = selected ? s.board?.cards.find((c) => c.key === selected)?.repo : undefined;
      const lane = repo && s.collapsedLanes[repo] ? { collapsedLanes: { ...s.collapsedLanes, [repo]: false } } : {};
      // another view starts without marks and lingering Cards, as in setView
      const fresh = view ? { view, linger: null, marked: s.marked.length ? [] : s.marked } : { linger: s.linger === selected ? s.linger : null };
      return { ...lane, ...fresh, selected, tab: tab ?? "now" };
    });
  },
  setRepoFilter: (repoFilter) => {
    storeFilter(repoFilter);
    // what the filter hides closes explicitly: the open Card (pane, tab, linger) and its marks, so nothing dangles out of sight (#47)
    set((s) => {
      if (!repoFilter) return { repoFilter };
      const hidden = (key: string) => s.board?.cards.find((c) => c.key === key)?.repo !== repoFilter;
      const closes = s.selected !== null && hidden(s.selected);
      return {
        repoFilter,
        ...(closes ? { selected: null, tab: "now" as Tab, linger: null } : {}),
        ...(s.marked.some(hidden) ? { marked: s.marked.filter((k) => !hidden(k)) } : {}),
      };
    });
  },
  setPalette: (o) => set((s) => modalPatch(s, "palette", o)),
  setCapture: (o) => set((s) => modalPatch(s, "capture", o)),
  setShortcuts: (o) => set((s) => modalPatch(s, "shortcuts", o)),
  setNotice: (notice) => set({ notice }),
  optimistic: (key, patch) => set((s) => ({ pending: { ...s.pending, [key]: { ...s.pending[key], ...patch } } })),
}));

/** card key -> writes in flight; their optimistic patches survive snapshots */
const inflight = new Map<string, number>();

/** Where the page is in a sync: `empty` = nothing to show yet while repos still load (first run, no cache). */
export function syncProgress(board: BoardView) {
  const entries = board.repos.map((r) => [r, board.sync[r]] as const);
  const syncing = entries.filter(([, s]) => s?.syncing).map(([r]) => r);
  const done = entries.filter(([, s]) => s?.at && !s.syncing).length;
  return { total: entries.length, done, syncing, active: syncing.length > 0, empty: syncing.length > 0 && board.cards.length === 0 };
}

let source: EventSource | null = null;

/** Reopen the stream, e.g. after notification permission was granted (`notify=1` tells the server this page notifies itself). */
export function reconnect() {
  source?.close();
  source = open();
}

function open() {
  const notify = "Notification" in window && Notification.permission === "granted";
  const es = new EventSource(notify ? "/api/events?notify=1" : "/api/events");
  es.addEventListener("board", (e) => {
    const board = JSON.parse((e as MessageEvent).data) as BoardView;
    // a snapshot built after a write finished already contains it; writes still in flight keep their patch
    useStore.setState((s) => {
      const handed = pruneHanded(s.handed, board.cards);
      const drafts = pruneDrafts(s.drafts, board.cards);
      const repoFilter = validFilter(s.repoFilter, board.repos);
      if (repoFilter !== s.repoFilter) storeFilter(repoFilter);
      return { board, repoFilter, connected: true, drafts: Object.keys(drafts).length ? drafts : NO_DRAFTS, pending: Object.fromEntries(Object.entries(s.pending).filter(([k]) => inflight.has(k))), handed: handed === s.handed ? handed : Object.keys(handed).length ? handed : NO_HANDED };
    });
  });
  es.onerror = () => useStore.setState({ connected: false });
  return es;
}

export function connect() {
  source = open();
  return () => source?.close();
}

/** A Feedback panel's fields, kept in the store under `key` (see `draftKey`) so they outlive the panel: Card switches, view changes, snapshots. Writes while typing. */
export function useDraft<T extends Draft>(key: string, init: T): [T, (patch: Partial<T>) => void] {
  const stored = useStore((s) => s.drafts[key]) as Partial<T> | undefined;
  return [{ ...init, ...stored }, (patch) => useStore.getState().setDraft(key, patch)];
}

/** The coordination log's last line per in-flight Card (Agent activity). */
export const useActivity = () => useStore((s) => s.board?.activity ?? NO_ACTIVITY);

/** `Date.now()`, refreshed every minute so "stuck" and ages follow the clock without a new snapshot. */
export function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** The Cards as the developer sees them: the snapshot with optimistic patches over it. */
export function currentCards(s: Pick<State, "board" | "pending" | "repoFilter">): Card[] {
  if (!s.board) return [];
  return s.board.cards
    .filter((c) => !s.repoFilter || c.repo === s.repoFilter)
    .map((c) => (s.pending[c.key] ? { ...c, ...s.pending[c.key] } : c));
}

/** Every Card of the Board with in-flight patches applied, whatever the repo filter. */
export function useAllCards(): Card[] {
  const board = useStore((s) => s.board);
  const pending = useStore((s) => s.pending);
  return useMemo(() => currentCards({ board, pending, repoFilter: null }), [board, pending]);
}

export function useCards(): Card[] {
  const board = useStore((s) => s.board);
  const pending = useStore((s) => s.pending);
  const repoFilter = useStore((s) => s.repoFilter);
  return useMemo(() => currentCards({ board, pending, repoFilter }), [board, pending, repoFilter]);
}

/** The Board grouped by repo: the lanes in order and which are collapsed. Null when the Board is one list (toggle off, or fewer than 2 repos shown). */
export interface LaneView {
  repos: string[];
  collapsed: Record<string, boolean>;
}
export function laneView(s: Pick<State, "board" | "repoFilter" | "lanes" | "collapsedLanes">): LaneView | null {
  if (!s.lanes || !s.board) return null;
  const repos = [...s.board.repos].filter((r) => !s.repoFilter || r === s.repoFilter).sort();
  return repos.length > 1 ? { repos, collapsed: s.collapsedLanes } : null;
}
export function useLaneView(): LaneView | null {
  const board = useStore((s) => s.board);
  const repoFilter = useStore((s) => s.repoFilter);
  const lanes = useStore((s) => s.lanes);
  const collapsedLanes = useStore((s) => s.collapsedLanes);
  return useMemo(() => laneView({ board, repoFilter, lanes, collapsedLanes }), [board, repoFilter, lanes, collapsedLanes]);
}

export function useMaps(): WayfinderMap[] {
  const board = useStore((s) => s.board);
  const repo = useStore((s) => s.repoFilter);
  return (board?.maps ?? []).filter((m) => !repo || m.repo === repo);
}

/** The sidebar's Waiting on me count and the per-Repo counts: real blockers only. A Look (To look at) waits on nobody, so it is not counted (#46 D1, GLOSSARY). */
export const blockerCount = (cards: Card[]): number => waitingOnMe(cards).length;

export const groupsOf = (cards: Card[], keep: string | null = null) => ({ waiting: waitingOnMe(cards), look: toLookAt(cards, keep) });

export function useCard(key: string | null): Card | null {
  const cards = useCards();
  return key ? (cards.find((c) => c.key === key) ?? null) : null;
}

// ---- API ----

export interface PushResult {
  delivered: boolean;
  runId: string | null;
  reason: string | null;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  // x-tandem: the server refuses writes without it (CSRF guard, src/server/guard.ts)
  const res = await fetch(path, { method, headers: { "content-type": "application/json", "x-tandem": "1" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  return json;
}

export const api = {
  cardPath: (c: Card) => `/api/cards/${c.repo}/${c.number}`,
  post: <T = { push: PushResult | null }>(path: string, body?: unknown) => call<T>("POST", path, body ?? {}),
  put: <T = { ok: true }>(path: string, body: unknown) => call<T>("PUT", path, body),
  get: <T>(path: string) => call<T>("GET", path),
};

export type WriteResult<T> = { ok: true; value: T } | { ok: false; error: string; message: string };

/** What an optimistic change hands back: how to undo it, and what to do once the write ended either way. */
export interface Applied {
  undo: () => void;
  settle?: () => void;
}

export interface WriteOptions {
  /** Names the write in the failure message: "Could not <what>: <error>". Without it the message is the bare error. */
  what?: string;
  /** The optimistic change, applied before the write starts. */
  apply?: () => Applied;
  /** Tell the developer when it failed (default). Off where the caller words one message for several writes. */
  notify?: boolean;
}

/**
 * The one way the client writes: apply the optimistic change at once, run the write, and on failure undo the change
 * and say what failed (a notice, unless `notify: false`; `message` is the text either way).
 */
export async function write<T>(run: () => Promise<T>, opts: WriteOptions = {}): Promise<WriteResult<T>> {
  const applied = opts.apply?.();
  try {
    return { ok: true, value: await run() };
  } catch (e) {
    applied?.undo();
    const error = e instanceof Error ? e.message : String(e);
    const message = opts.what ? `Could not ${opts.what}: ${error}` : error;
    if (opts.notify !== false) useStore.getState().setNotice({ key: "", text: message, canStart: false, failed: true });
    return { ok: false, error, message };
  } finally {
    applied?.settle?.();
  }
}

/** `write` for a Card (callers word their own failure message, e.g. one for a bulk set, so no notice by default): its patch shows over the server's Card until a snapshot reflects the write, and is rolled back on failure. */
export function writeCard<T>(card: Card, patch: Partial<Card>, run: () => Promise<T>, opts: Omit<WriteOptions, "apply"> = {}): Promise<WriteResult<T>> {
  return write(run, {
    notify: false,
    ...opts,
    apply: () => {
      useStore.getState().optimistic(card.key, patch);
      inflight.set(card.key, (inflight.get(card.key) ?? 0) + 1);
      return {
        undo: () => {
          // a second write in flight keeps the patch it built on; the last one out clears it
          if (inflight.get(card.key) !== 1) return;
          useStore.setState((s) => {
            const { [card.key]: _, ...rest } = s.pending;
            return { pending: rest };
          });
        },
        settle: () => {
          const n = (inflight.get(card.key) ?? 1) - 1;
          if (n > 0) inflight.set(card.key, n);
          else inflight.delete(card.key);
        },
      };
    },
  });
}

let refreshing = false;
/** Palette "Refresh from GitHub": says that it started and how it ended; a second request meanwhile is ignored. */
export async function refreshFromGitHub() {
  if (refreshing) return;
  refreshing = true;
  // the "Refreshing" toast has no timer: it must not end while the refresh still runs; the outcome replaces it in place (a failure says so in its own toast)
  useStore.getState().setNotice({ key: "", text: "Refreshing from GitHub…", canStart: false, busy: true, id: "refresh" });
  try {
    const res = await write(() => api.post("/api/refresh"), { what: "refresh from GitHub" });
    if (res.ok) useStore.getState().setNotice({ key: "", text: "Refreshed from GitHub", canStart: false, id: "refresh" });
    else closeToast("refresh");
  } finally {
    refreshing = false;
  }
}

type Open = Pick<State, "board" | "pending" | "repoFilter" | "selected" | "view">;
const waitingNow = (s: Open) => ({ keys: groupsOf(currentCards(s)).waiting.map((c) => c.key), sel: s.selected, filter: s.repoFilter, view: s.view });

/**
 * Waiting on me: the developer's own answer took the open blocker out of the list, so the next blocker takes its place
 * (the last one: the pane keeps the Card on Decided). Only this path advances; a Card that leaves the list because an answer came
 * from elsewhere (GitHub, a terminal) or a snapshot arrived stays open and shows its new state.
 */
function advanceAfterAnswer(was: ReturnType<typeof waitingNow>) {
  const s = useStore.getState();
  if (was.view !== "waiting" || s.view !== "waiting") return;
  const next = nextAfterAnswer(was, { keys: waitingNow(s).keys, selected: s.selected, filter: s.repoFilter });
  if (!next) return;
  if (next.open) s.select(next.open);
  else s.setTab("decided");
}

/** Run a Feedback action: patch the Card at once, write, then report the Push outcome. Resolves to whether the write went through. */
export async function giveFeedback(card: Card, action: string, body: Record<string, unknown>, patch: Partial<Card>): Promise<boolean> {
  const { setNotice } = useStore.getState();
  useStore.getState().clearFailure(card.key);
  const was = waitingNow(useStore.getState());
  const write = writeCard(card, patch, () => api.post(`${api.cardPath(card)}/${action}`, body)); // the optimistic patch is applied by now
  advanceAfterAnswer(was);
  const res = await write;
  if (!res.ok) {
    // the Card is back in the list; bring it back into view and say why on the Card itself
    useStore.getState().fail(card.key, res.error);
    useStore.getState().select(card.key, "now"); // "now" also when it is still the open Card on Decided (the last blocker)
    setNotice({ key: card.key, text: `Failed: ${res.error}`, canStart: false, failed: true });
    return false;
  }
  useStore.getState().clearFailure(card.key);
  const push = res.value.push;
  if (push && !push.delivered) {
    // only an answered "nobody is there" offers a start; a Push that failed says why (starting a coordinator would not fix it)
    const none = push.reason === NO_COORDINATOR;
    setNotice({ key: card.key, text: `Feedback given, awaiting pickup: ${none ? NO_COORDINATOR : `could not push (${push.reason})`}`, canStart: none });
  } else if (push?.delivered) {
    setNotice({ key: card.key, text: "Feedback given and pushed to the coordinator", canStart: false });
  } else {
    setNotice({ key: card.key, text: "Feedback given (not pushed)", canStart: false });
  }
  return true;
}

/**
 * Open a Card on purpose from outside the lists (palette, notification, Agent activity): one new history entry (#48).
 * Settings has no Card pane, so it goes to the Board first (`opts.view` names another view); Maps shows the pane itself.
 */
export function openCard(key: string, opts: { view?: View; tab?: Tab } = {}) {
  const s = useStore.getState();
  const view = opts.view ?? (s.view === "settings" ? "board" : undefined);
  // a Card the Repo filter hides (a notification names any repo) lifts the filter: it opens where the developer can see it
  const card = s.board?.cards.find((c) => c.key === key);
  if (s.repoFilter && card && card.repo !== s.repoFilter) s.setRepoFilter(null);
  s.select(key, opts.tab, { nav: "push", view });
}
