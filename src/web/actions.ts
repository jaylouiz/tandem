// What the command palette offers, built from state (`paletteActions`, pure) so a unit test can build the fullest palette and check it against the
// key table: every binding in `BINDINGS` has an entry here or a reason in `NO_ENTRY`. An entry with a `binding` shows that binding's key, read from
// the table (never typed here); an entry without one has no key. Palette.tsx only collects the state, renders the entries and adds the Cards and Repos.
import type { ShotsTarget } from "../core/gallery.ts";
import type { Card } from "../core/types.ts";
import { keyCaps, BINDINGS, runBinding } from "./keys.ts";
import type { PanelKeys } from "./panelKeys.ts";
import { TABS, refreshFromGitHub, useStore, type Tab, type View } from "./store.ts";
import { markSelectionSeen } from "./seen.ts";
import { runMove, runTriage, type MoveEntry, type TriageEntry } from "./triage.ts";
import { startCoordinator } from "./components/CardPane.tsx";
import { undoLatest } from "./ui/Toast.tsx";

export interface PaletteAction {
  /** unique, also the cmdk value's tiebreak */
  id: string;
  group: string;
  label: string;
  /** the id of the `BINDINGS` entry this runs (its key is shown) */
  binding?: string;
  /** the key shown when the binding has several or this entry presses a specific one (`]` for the next tab) */
  keys?: string;
  /** more words the search matches */
  search?: string;
  run: () => void;
}

/** Bindings with no palette entry, and why. Everything else in `BINDINGS` needs one (keys.test.ts). */
export const NO_ENTRY: Record<string, string> = {
  palette: "the palette is the place these entries are listed in",
  "leave-field": "Esc inside a text field is not a command",
  "focus-next": "the same step as Next Card (j), which has its entry",
  "focus-previous": "the same step as Previous Card (k), which has its entry",
};

/** The state the entries depend on. Collected by the Palette from the store; a test passes the fullest one. */
export interface ActionCtx {
  view: View;
  /** the open Card, if any */
  card: Card | null;
  /** the Card awaits pickup and no coordinator runs for its Repo (Start coordinator) */
  startable: boolean;
  /** its last Feedback was not sent (the Not sent message shows) */
  failed: boolean;
  tab: Tab;
  /** Waiting on me is in Focus (one Card at a time) */
  focus: boolean;
  /** how many Cards are marked */
  marked: number;
  shots: ShotsTarget | null;
  canUndo: boolean;
  repoCount: number;
  lanes: boolean;
  repoFilter: string | null;
  /** the Feedback panel of the open Card, when its tab is open */
  panel: PanelKeys | null;
  /** the triage entries that do something for the targets (marked Cards, else the open Card) */
  triage: { targets: number; moves: MoveEntry[]; entries: TriageEntry[]; seen: boolean; unseen: boolean };
  setTheme: (t: "light" | "dark" | null) => void;
}

const run = (id: string, key?: string) => () => runBinding(id, key);

export function paletteActions(c: ActionCtx): PaletteAction[] {
  const s = () => useStore.getState();
  const out: PaletteAction[] = [];
  const add = (a: PaletteAction) => out.push(a);
  const cards = c.view === "waiting" || c.view === "board";

  for (const [id, label, view] of [
    ["go-waiting", "Waiting on me", "waiting"],
    ["go-board", "Board", "board"],
    ["go-maps", "Wayfinder maps", "maps"],
    ["go-settings", "Settings", "settings"],
  ] as const)
    add({ id, group: "Go to", label, binding: id, run: () => s().setView(view) });
  add({ id: "go-agents", group: "Go to", label: "Agent activity", binding: "go-agents", run: () => s().setAgentsOpen(true) });

  add({ id: "focus", group: "Go to", label: c.focus ? "Leave Focus: back to the list" : "Focus: Waiting on me, one Card at a time", binding: "focus", search: "focus one by one slideshow guided go through", run: () => s().setFocus(!c.focus) });

  const card = c.card;
  if (card) {
    const at = TABS.findIndex((t) => t.id === c.tab);
    const next = TABS[(at + 1) % TABS.length]!.id;
    const previous = TABS[(at + TABS.length - 1) % TABS.length]!.id;
    for (const t of TABS)
      add({
        id: `tab-${t.id}`,
        group: "Card",
        label: `Tab: ${t.label}`,
        search: "card tab",
        ...(!cards ? {} : t.id === next ? { binding: "tab", keys: "]" } : t.id === previous ? { binding: "tab", keys: "[" } : {}),
        run: () => s().setTab(t.id),
      });
    add({ id: "show-log", group: "Card", label: "Show coordination log", search: "activity", run: () => s().setTab("activity") });
    if (cards) {
      add({ id: "next", group: "Card", label: "Next Card", binding: "next", run: run("next", "j") });
      add({ id: "previous", group: "Card", label: "Previous Card", binding: "previous", run: run("previous", "k") });
    }
    // the keys below are Card-scoped: on Maps they do nothing, so Mark (its marks would be invisible there) is not offered and Open runs without a key
    if (cards) add({ id: "mark", group: "Card", label: "Mark the open Card", binding: "mark", search: "select", run: run("mark") });
    add({ id: "open", group: "Card", label: "Open on GitHub", ...(cards ? { binding: "open" } : {}), run: () => void window.open(card.url, "_blank") });
    add({ id: "close-card", group: "Card", label: "Close the Card", binding: "escape", keys: "esc", run: () => s().select(null) });
    if (c.shots) add({ id: "shots", group: "Card", label: "Open screenshots of this Card", run: () => s().requestShots(card.key, c.shots!) });
    if (card.fog)
      add({ id: "copy-wayfinder", group: "Card", label: `Copy /wayfinder ${card.number}`, run: () => void navigator.clipboard?.writeText(`/wayfinder ${card.number}`) });
    if (c.startable) add({ id: "start-coordinator", group: "Card", label: "Start coordinator", search: "feedback pickup", run: () => void startCoordinator([card]) });
    if (c.failed) add({ id: "dismiss-failure", group: "Card", label: "Dismiss the Not sent message", run: () => s().clearFailure(card.key) });
  }

  // the open Feedback panel: its digits, its Send, and the buttons without a key
  const panel = c.panel;
  if (panel) {
    for (const ch of panel.choices())
      add({ id: `choice-${ch.n}`, group: "Feedback", label: ch.label, binding: "pick-choice", keys: String(ch.n), search: ch.on ? "chosen" : "", run: () => panel.pick(ch.n) });
    if (panel.canSend()) add({ id: "send-feedback", group: "Feedback", label: "Send the chosen Feedback", binding: "send-feedback", run: () => panel.send() });
    for (const x of panel.extras()) add({ id: `panel-${x.id}`, group: "Feedback", label: x.label, run: x.run });
  }

  add({ id: "capture", group: "Actions", label: "Capture an idea", binding: "capture", run: () => s().setCapture(true) });
  add({ id: "shortcuts", group: "Actions", label: "Keyboard shortcuts", binding: "shortcuts", search: "keys help overview", run: () => s().setShortcuts(true) });
  if (c.canUndo) add({ id: "undo", group: "Actions", label: "Undo the last change", binding: "undo", search: "toast", run: () => void undoLatest() });
  add({ id: "refresh", group: "Actions", label: "Refresh from GitHub", run: () => void refreshFromGitHub() });
  if (c.repoCount > 1)
    add({ id: "lanes", group: "Actions", label: c.lanes ? "Show Board as one list" : "Group Board by repo", search: "board lanes one list", run: () => s().setLanes(!c.lanes) });
  add({ id: "theme-light", group: "Actions", label: "Theme: light", run: () => c.setTheme("light") });
  add({ id: "theme-dark", group: "Actions", label: "Theme: dark", run: () => c.setTheme("dark") });
  add({ id: "theme-system", group: "Actions", label: "Theme: system", run: () => c.setTheme(null) });

  // the Selection: marks and the keys that extend them (marked Cards, else the open Card, are what triage acts on)
  if (c.marked) add({ id: "clear-marks", group: "Selection", label: "Clear the selection", binding: "escape", keys: "esc", run: () => s().clearMarks() });
  if (card && cards) {
    add({ id: "select-all", group: "Selection", label: "Select all Cards of this column or group", binding: "select-all", run: run("select-all") });
    if (c.view === "board") {
      add({ id: "extend-down", group: "Selection", label: "Extend the selection down", binding: "extend-down", run: run("extend-down") });
      add({ id: "extend-up", group: "Selection", label: "Extend the selection up", binding: "extend-up", run: run("extend-up") });
    }
  }

  const t = c.triage;
  if (t.targets > 0) {
    const group = t.targets > 1 ? `Triage ${t.targets} Cards` : "Triage";
    for (const e of t.moves) add({ id: e.id, group, label: e.label, binding: e.id, search: "triage", run: () => void runMove(e.to) });
    for (const e of t.entries) add({ id: e.id, group, label: e.label, binding: e.id, search: "triage", run: () => void runTriage(e) });
    if (t.seen) add({ id: "seen", group, label: "Mark Seen", binding: "seen", search: "triage", run: () => void markSelectionSeen() });
    if (t.unseen) add({ id: "unseen", group, label: "Mark unseen", search: "triage", run: () => void markSelectionSeen(false) });
  }

  add({
    id: "clear-repo-filter",
    group: "Filter by repo",
    label: c.repoFilter ? "Clear the Repo filter" : "All repos",
    ...(c.repoFilter ? { binding: "clear-repo-filter", keys: "esc" } : {}),
    search: "all repos",
    run: () => s().setRepoFilter(null),
  });
  return out;
}

/** The key an entry shows: its own override, else the binding's first cap. */
export const keyShown = (a: PaletteAction): string | null => a.keys ?? (a.binding ? keyCaps(BINDINGS.find((b) => b.id === a.binding)!)[0]! : null);
