// Every keyboard binding of the app, in one table (BINDINGS) and one dispatcher (handleKey). The window listener in App.tsx only
// hands each keydown to `handleKey`. The shortcut overview (`?`), the palette entries (actions.ts) and the tooltips' key caps (`keyOf`) read this
// table, nothing else decides or lists keys; a new key goes here, with its `group` and its palette entry (keys.test.ts fails without one).
import type { Card } from "../core/types.ts";
import { panelKeys } from "./panelKeys.ts";
import { extendSelection, keyFocus, selectGroup } from "./select.ts";
import { markSelectionSeen, openFromList } from "./seen.ts";
import { anyDialogOpen, keyFromDialog } from "./ui/Dialog.tsx";
import { keyFromToast, undoLatest } from "./ui/Toast.tsx";
import { TABS, showsCards, useStore, type View } from "./store.ts";
import { runFocusKey, type FocusKeyId } from "./focus/keys.ts";
import { useFocus } from "./focus/session.ts";
import { MOVE_ENTRIES, TRIAGE_ENTRIES, runMove, runTriage } from "./triage.ts";

/** What the current view shows, for the bindings that walk or mark Cards. */
export interface KeyCtx {
  /** the Cards in on-screen order */
  order: Card[];
  /** the same Cards split into the lists a ⌘A marks: Board columns, Waiting on me groups */
  groups: Card[][];
}

/** The headings of the shortcut overview. */
export const KEY_GROUPS = ["Anywhere", "Go to", "Cards", "Selection", "Triage", "Feedback", "Focus"] as const;
export type KeyGroup = (typeof KEY_GROUPS)[number];

export interface Binding {
  id: string;
  group: KeyGroup;
  /** where it is live, when that is narrower than its scope says (the overview shows it beside the key) */
  when?: string;
  /** the first key of chords (`g`): the chord bindings carry the overview rows and palette entries, this one has none */
  prefix?: boolean;
  /** `KeyboardEvent.key` values that trigger it (the overview shows them; a chord shows `<chord> <key>`) */
  keys: string[];
  label: string;
  /** "anywhere", or "cards": only on a view that lists Cards (Waiting on me, Board); Maps and Settings have none to act on */
  scope: "anywhere" | "cards";
  /** held ⌘ or Ctrl */
  mod?: boolean;
  /** a first key (`g`) that this binding's key must follow */
  chord?: string;
  /** when it is live: "idle" (default) = no dialog open, focus not in a text field; "typing" = also in a text field; "always" = also with a dialog open */
  live?: "idle" | "typing" | "always";
  /** return false when it did nothing: the key then goes on to the next binding and the browser keeps its default */
  run: (e: KeyboardEvent, ctx: KeyCtx) => boolean | void;
}

/** The Feedback panel of the open Card, when its number keys and ⌘↵ are live (the panel registers only while its tab is open; the bindings are scoped to Card views, so never on Maps or Settings). */
const livePanel = () => (panelKeys.current && panelKeys.current.cardKey === useStore.getState().selected ? panelKeys.current : null);

const inFocus = () => useStore.getState().focus;
/** Focus shows an ask (not its start or its end): only then j / k and the arrows have a Card to step from. */
const asking = () => useFocus.getState().stage === "ask";

/**
 * A key that is Focus's own while Focus is on. What it does depends on what is on screen (`focus/keys.ts`); when that is nothing, the key
 * is still spent, so it never reaches the Card behind the ask (`x` would mark it, `[` `]` would turn its tabs). Outside Focus it hands the key on.
 */
const focusKey = (id: FocusKeyId, keys: string[], label: string): Binding => ({
  id,
  group: "Focus",
  when: "Focus",
  keys,
  label,
  scope: "cards",
  run: (e) => {
    if (!inFocus()) return false;
    runFocusKey(id, e);
  },
});

/** j / k: open the neighbour; in Waiting on me a To look at Card is marked Seen by the open (the developer's own, unlike an automatic selection). */
function step(card: Card) {
  const s = useStore.getState();
  if (s.focus) s.select(card.key); // Focus only shows the Card: a Look is marked Seen by the developer's own Mark Seen, not by passing it
  else if (s.view === "waiting") openFromList(card, !!card.needsLook && !card.waiting);
  else {
    keyFocus.key = card.key;
    s.select(card.key);
  }
}

/** Move the open Card by `dir`; false when the selection did not move (arrow keys then keep their scrolling). */
function move({ order }: KeyCtx, dir: 1 | -1) {
  const s = useStore.getState();
  if (!order.length) return false;
  let i = order.findIndex((c) => c.key === s.selected);
  // Focus: the ask on screen may have left the queue (it is being written, or was answered elsewhere). The Card that took its place
  // is the next one and the one before it the previous, as Up next says: step from where it was, not from the top.
  if (i < 0 && s.focus && s.selected) i = useFocus.getState().at - (dir === 1 ? 1 : 0);
  const to = order[Math.max(0, Math.min(order.length - 1, i + dir))]!;
  if (to.key === s.selected) return false;
  step(to);
}

const GO: [string, string, View][] = [
  ["w", "Waiting on me", "waiting"],
  ["b", "Board", "board"],
  ["m", "Wayfinder maps", "maps"],
  ["s", "Settings", "settings"],
];

/** ⌘K opens the Palette, or closes it; with Capture, Agent activity or the Gallery open it does nothing (one modal at a time, #42). */
function togglePalette() {
  const s = useStore.getState();
  if (anyDialogOpen() && s.modal !== "palette") return;
  s.setPalette(s.modal !== "palette");
}

export const BINDINGS: Binding[] = [
  { id: "palette", group: "Anywhere", keys: ["k"], mod: true, label: "Command palette", scope: "anywhere", live: "always", run: togglePalette },
  // a text field gives focus back first: the first Esc blurs it and keeps the text, the next one acts as usual (#41)
  {
    id: "leave-field",
    group: "Anywhere",
    keys: ["Escape"],
    label: "Leave the text field",
    scope: "anywhere",
    live: "typing",
    run: (e) => {
      const el = e.target;
      if (!(el instanceof HTMLElement) || el.closest("input, textarea, select, [contenteditable]") === null) return false; // not in a field: Esc acts as usual
      el.blur();
    },
  },
  {
    id: "send-feedback",
    group: "Feedback",
    when: "Feedback panel open",
    keys: ["Enter"],
    mod: true,
    label: "Send the chosen Feedback",
    scope: "cards",
    run: (e) => {
      const panel = livePanel();
      if (!panel) return false;
      if (e.repeat) return; // a held key writes once
      panel.send();
    },
  },
  {
    id: "pick-choice",
    group: "Feedback",
    when: "Feedback panel open",
    keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
    label: "Pick a Feedback choice",
    scope: "cards",
    run: (e) => {
      const panel = livePanel(); // digits belong to the open Feedback panel; priority keys stay for Cards without one
      if (!panel) return false;
      // A held digit acts once. In Focus a digit sends, and the next ask takes the screen as soon as the write is through: without
      // this, the key's auto-repeat would answer that one too (and the one after), each a comment that cannot be taken back.
      if (e.repeat) return;
      panel.pick(Number(e.key));
    },
  },
  ...GO.map(([key, label, view]): Binding => ({
    id: `go-${view}`,
    group: "Go to",
    keys: [key],
    chord: "g",
    label: `Go to ${label}`,
    scope: "anywhere",
    run: () => useStore.getState().setView(view),
  })),
  { id: "go-agents", group: "Go to", keys: ["a"], chord: "g", label: "Agent activity", scope: "anywhere", run: () => useStore.getState().setAgentsOpen(true) },
  { id: "chord-g", group: "Go to", prefix: true, keys: ["g"], label: "Go to…", scope: "anywhere", run: () => startChord("g") },
  {
    id: "focus",
    group: "Go to",
    keys: ["f"],
    label: "Focus: Waiting on me, one Card at a time",
    scope: "anywhere",
    run: () => {
      const s = useStore.getState();
      s.setFocus(!s.focus);
    },
  },
  // Focus reads left to right like a deck: the arrows step it too (elsewhere they keep their scrolling)
  { id: "focus-next", group: "Focus", when: "Focus", keys: ["ArrowRight"], label: "Skip to the next Card", scope: "cards", run: (_, ctx) => (inFocus() && asking() ? move(ctx, 1) : false) },
  { id: "focus-previous", group: "Focus", when: "Focus", keys: ["ArrowLeft"], label: "Back to the previous Card", scope: "cards", run: (_, ctx) => (inFocus() && asking() ? move(ctx, -1) : false) },
  // Enter on a button or a link stays that control's own (the act passes); elsewhere on the start screen it starts
  { id: "focus-start", group: "Focus", when: "Focus", keys: ["Enter"], label: "Start with the first Card", scope: "cards", run: (e) => inFocus() && runFocusKey("focus-start", e) },
  focusKey("focus-note", ["n"], "Answer with a note (a design round: react with a comment)"),
  focusKey("focus-details", ["e"], "Card details: Decided, Activity, Issue"),
  focusKey("focus-side", ["t"], "Design round: all variants side by side"),
  focusKey("focus-viewport", ["v"], "Switch the screenshot between desktop and mobile"),
  focusKey("focus-step", ["[", "]"], "Previous / next variant of a design round, or state of a Look"),
  focusKey("focus-reject", ["x"], "Design round: reject the shown variant"),
  // in Focus the up and down arrows scroll the ask (a screenshot at real size is taller than the window); j / k and ← → step
  { id: "next", group: "Cards", keys: ["j", "ArrowDown"], label: "Next Card", scope: "cards", run: (e, ctx) => (inFocus() && (!asking() || e.key === "ArrowDown") ? false : move(ctx, 1)) },
  { id: "previous", group: "Cards", keys: ["k", "ArrowUp"], label: "Previous Card", scope: "cards", run: (e, ctx) => (inFocus() && (!asking() || e.key === "ArrowUp") ? false : move(ctx, -1)) },
  {
    id: "extend-down",
    group: "Selection",
    when: "Board only",
    keys: ["J"],
    label: "Extend the selection down",
    scope: "cards",
    run: () => (useStore.getState().view === "board" ? extendSelection(1) : false),
  },
  // Focus has no Selection: the Cards behind the ask are not in view, so nothing marks them (`x` is Focus's own, above)
  {
    id: "extend-up",
    group: "Selection",
    when: "Board only",
    keys: ["K"],
    label: "Extend the selection up",
    scope: "cards",
    run: () => (useStore.getState().view === "board" ? extendSelection(-1) : false),
  },
  {
    id: "select-all",
    group: "Selection",
    keys: ["a"],
    mod: true,
    label: "Select all Cards of the open Card's column or group",
    scope: "cards",
    run: (_, ctx) => (inFocus() ? undefined : selectGroup(ctx.groups)),
  },
  {
    id: "mark",
    group: "Selection",
    keys: ["x"],
    label: "Mark the open Card",
    scope: "cards",
    run: () => {
      const s = useStore.getState();
      if (s.selected) s.toggleMark(s.selected);
    },
  },
  // in Focus only the Look on screen is marked, by the developer's own key; on any other ask the key does nothing
  { id: "seen", group: "Cards", keys: ["l"], label: "Mark Seen", scope: "cards", run: (e) => void (inFocus() ? !e.repeat && runFocusKey("seen", e) : markSelectionSeen()) },
  {
    id: "tab",
    group: "Cards",
    keys: ["[", "]"],
    label: "Previous / next Card tab",
    scope: "cards",
    run: (e) => {
      const s = useStore.getState();
      if (s.selected) s.setTab(TABS[(TABS.findIndex((t) => t.id === s.tab) + (e.key === "]" ? 1 : -1) + TABS.length) % TABS.length]!.id);
    },
  },
  {
    id: "open",
    group: "Cards",
    keys: ["o"],
    label: "Open on GitHub",
    scope: "cards",
    run: () => {
      const s = useStore.getState();
      const c = s.board?.cards.find((x) => x.key === s.selected);
      if (c) window.open(c.url, "_blank");
    },
  },
  // triage acts on the open Card: not in Focus, where the Card behind the ask is not what the developer is looking at
  ...MOVE_ENTRIES.map((m): Binding => ({ id: m.id, group: "Triage", keys: [m.key], label: m.label, scope: "cards", run: () => (inFocus() ? false : void runMove(m.to)) })),
  ...TRIAGE_ENTRIES.map((t): Binding => ({
    id: t.id,
    group: "Triage",
    when: /^[1-3]$/.test(t.key) ? "without a Feedback panel" : undefined,
    keys: [t.key],
    label: t.label,
    scope: "cards",
    run: () => (inFocus() ? false : void runTriage(t)),
  })),
  // the Undo a toast offers, while it is offered: older ones too, newest first (a later toast does not take an earlier Undo away). In a text field ⌘Z stays the field's own.
  { id: "undo", group: "Anywhere", keys: ["z"], mod: true, label: "Undo the last change a toast offers", scope: "anywhere", run: () => undoLatest() },
  { id: "shortcuts", group: "Anywhere", keys: ["?"], label: "Keyboard shortcuts", scope: "anywhere", run: () => useStore.getState().setShortcuts(true) },
  { id: "capture", group: "Anywhere", keys: ["c"], label: "Capture an idea", scope: "anywhere", run: () => useStore.getState().setCapture(true) },
  {
    id: "escape",
    group: "Anywhere",
    keys: ["Escape"],
    label: "Clear the selection; in Focus cancel the note, back to the overview, then leave; close the Card",
    scope: "anywhere",
    run: (e) => {
      const s = useStore.getState();
      if (s.marked.length) s.clearMarks();
      else if (s.focus) {
        // Focus steps back one layer at a time: the note, then the overview (the drawer is a dialog and closed itself); from the overview, out
        if (!runFocusKey("escape", e)) s.setFocus(false);
      }
      else if (s.view === "waiting") {
        const list = document.querySelector<HTMLElement>('[data-testid="waiting-list"]');
        if (!s.selected || !list || document.activeElement === list) return false; // nothing open, or Esc has taken the list's focus already: on to the next layer
        list.focus(); // the Card stays open
      } else if (s.selected) s.select(null);
      else return false;
    },
  },
  // the outermost layer: Esc with nothing left to close clears the Repo filter (#47); the chip's × and the palette do the same
  {
    id: "clear-repo-filter",
    group: "Anywhere",
    keys: ["Escape"],
    label: "Clear the Repo filter",
    scope: "anywhere",
    run: () => (useStore.getState().repoFilter ? useStore.getState().setRepoFilter(null) : false),
  },
];

let chord: string | null = null;
let chordTimer: ReturnType<typeof setTimeout> | undefined;

function startChord(first: string) {
  chord = first;
  clearTimeout(chordTimer);
  chordTimer = setTimeout(() => (chord = null), 800);
}

const isText = (el: EventTarget | null) => el instanceof HTMLElement && el.closest("input, textarea, select, [contenteditable]") !== null;

/** One keydown through the table. Whatever a binding handled gets `preventDefault`; a binding that returns false leaves the key to the next one and the browser. */
export function handleKey(e: KeyboardEvent, ctx: KeyCtx) {
  if (e.key === "Escape" && keyFromToast(e)) return; // Esc on a focused toast dismissed it: the toast owns that key
  const s = useStore.getState();
  const dialog = anyDialogOpen() || keyFromDialog(e); // dialogs own their keys, also one that closed while this key was on its way
  const typing = isText(e.target);
  const mod = e.metaKey || e.ctrlKey;
  const key = mod && e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const live = (b: Binding) => {
    const at = b.live ?? "idle";
    return dialog ? at === "always" : typing ? at !== "idle" : true;
  };
  const here = (b: Binding) => b.scope === "anywhere" || showsCards(s.view);
  if (chord) {
    // the key after a chord's first key: a known one acts, any other drops the chord
    const first = chord;
    chord = null;
    if (typing || dialog || mod || e.altKey) return;
    const b = BINDINGS.find((x) => x.chord === first && x.keys.includes(key));
    if (b && here(b)) {
      b.run(e, ctx);
      e.preventDefault();
    }
    return;
  }
  // ⌘/Ctrl with Shift is another chord (⌘⇧Z is the system's Redo): no binding here uses it
  for (const b of BINDINGS) {
    if (b.chord || !b.keys.includes(key) || !!b.mod !== mod || e.altKey || (mod && e.shiftKey) || !live(b) || !here(b)) continue;
    if (b.run(e, ctx) === false) continue;
    e.preventDefault();
    return;
  }
}

// ---- Showing keys: overview, palette and tooltips all print them from here ----

const CAP: Record<string, string> = { Enter: "↵", Escape: "esc", ArrowDown: "↓", ArrowUp: "↑", ArrowLeft: "←", ArrowRight: "→" };

/** One key as its cap reads: `J` is ⇧J, with ⌘ the letter is upper case (⌘K, ⌘↵). */
const cap = (k: string, mod: boolean) => (mod ? `⌘${CAP[k] ?? k.toUpperCase()}` : (CAP[k] ?? (k.length === 1 && k !== k.toLowerCase() ? `⇧${k}` : k)));

/** The ways to press `b`, as key caps: `["j", "↓"]`, `["⌘↵"]`, `["g w"]`; a run of digits is one cap (`1–9`). */
export function keyCaps(b: Pick<Binding, "keys" | "mod" | "chord">): string[] {
  const digits = b.keys.length > 2 && b.keys.every((k, i) => /^\d$/.test(k) && (i === 0 || Number(k) === Number(b.keys[i - 1]) + 1));
  const caps = digits ? [`${b.keys[0]}–${b.keys.at(-1)}`] : b.keys.map((k) => cap(k, !!b.mod));
  return b.chord ? caps.map((c) => `${b.chord} ${c}`) : caps;
}

/** The first (shortest to say) cap of the binding `id`, for a tooltip or a palette entry: `keyOf("open")` is "o". */
export function keyOf(id: string): string {
  const b = BINDINGS.find((x) => x.id === id);
  if (!b) throw new Error(`no binding ${id}`);
  return keyCaps(b)[0]!;
}

/** What the window handler has to work with, kept current by App.tsx: the palette runs a binding through it exactly like its key would. */
export const keyCtxRef: { current: KeyCtx } = { current: { order: [], groups: [] } };

/** Run the binding `id` as if `key` (default: its first) was pressed, e.g. from a palette entry. */
export function runBinding(id: string, key?: string): void {
  const b = BINDINGS.find((x) => x.id === id);
  if (!b) throw new Error(`no binding ${id}`);
  if (b.scope === "cards" && !showsCards(useStore.getState().view)) return; // the key would do nothing here either
  b.run(new KeyboardEvent("keydown", { key: key ?? b.keys[0], metaKey: !!b.mod }), keyCtxRef.current);
}
