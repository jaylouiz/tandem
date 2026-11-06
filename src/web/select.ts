// Selection on the Board: cmd/ctrl-click toggles, shift-click and shift+j/k extend inside one column.
// The marks themselves live in the store (`marked`); this file only decides which Cards a gesture marks.
import type { MouseEvent } from "react";
import { laneOrder } from "../core/card.ts";
import type { Card, Phase } from "../core/types.ts";
import { openFromList } from "./seen.ts";
import { currentCards, laneView, useStore } from "./store.ts";

/** The Card the keyboard just moved to: the Board focuses its element once it renders (roving focus, #41). */
export const keyFocus: { key: string | null } = { key: null };

/** The Card a shift-click ranges from: the last plain or cmd/ctrl click (else the open Card). */
let anchor: string | null = null;

/** A Phase's Cards in screen order: Board order, lane by lane when the Board is grouped by repo; Cards in a collapsed lane are not on screen (#36). */
function column(cards: Card[], phase: Phase) {
  const lanes = laneView(useStore.getState());
  return cards.filter((c) => c.phase === phase && !lanes?.collapsed[c.repo]).sort(laneOrder(lanes?.repos ?? null));
}

/** Keys of the Cards from `from` to `to` within `list` (a column, a list group), both included; null when either is not in it. */
export function rangeIn(list: Card[], from: string | null, to: Card): string[] | null {
  const a = list.findIndex((c) => c.key === from);
  const b = list.findIndex((c) => c.key === to.key);
  if (a < 0 || b < 0) return null;
  return list.slice(Math.min(a, b), Math.max(a, b) + 1).map((c) => c.key);
}

/** Keys of the Cards from `from` to `to` in `to`'s column, both included; null when `from` is not in that column. */
export const rangeKeys = (cards: Card[], from: string | null, to: Card) => rangeIn(column(cards, to.phase), from, to);

const union = (...lists: string[][]) => [...new Set(lists.flat())];

type Click = Pick<MouseEvent, "shiftKey" | "metaKey" | "ctrlKey">;

/** A click on a Board Card: plain opens it and clears the selection, cmd/ctrl toggles it, shift extends from the anchor within the column. */
export function clickCard(card: Card, e: Click) {
  const s = useStore.getState();
  if (!(e.shiftKey || e.metaKey || e.ctrlKey)) {
    anchor = card.key;
    s.clearMarks();
    s.select(card.key, undefined, { nav: "push" });
    return;
  }
  mark(card, e, (from) => rangeKeys(currentCards(s), from, card));
}

/** A click on a Waiting on me row: plain opens it (a To look at Card is marked Seen) and clears the selection, modifiers mark within the row's group like on the Board. */
export function clickRow(card: Card, group: Card[], inLook: boolean, e: Click) {
  const s = useStore.getState();
  if (!(e.shiftKey || e.metaKey || e.ctrlKey)) {
    anchor = card.key;
    s.clearMarks();
    openFromList(card, inLook, "push");
    return;
  }
  mark(card, e, (from) => rangeIn(group, from, card));
}

/** The modifier part of a click: the open Card joins the selection the first time, then toggle (cmd/ctrl) or range (shift). */
function mark(card: Card, e: Click, range: (from: string | null) => string[] | null) {
  const s = useStore.getState();
  // the open Card joins the selection the first time a modifier-click starts one
  const seed = s.marked.length === 0 && s.selected && s.selected !== card.key ? [s.selected] : [];
  if (e.shiftKey) {
    const keys = range(anchor ?? s.selected);
    if (keys) {
      s.setMarks(union(s.marked, seed, keys));
      return;
    }
  }
  s.setMarks(s.marked.includes(card.key) ? s.marked.filter((k) => k !== card.key) : union(s.marked, seed, [card.key]));
  anchor = card.key;
}

/** shift+j / shift+k: mark the open Card and its neighbour in the column, and open the neighbour. */
export function extendSelection(dir: 1 | -1) {
  const s = useStore.getState();
  const all = currentCards(s);
  const cur = all.find((c) => c.key === s.selected);
  if (!cur) return;
  const col = column(all, cur.phase);
  const next = col[col.findIndex((c) => c.key === cur.key) + dir];
  if (!next) {
    s.setMarks(union(s.marked, [cur.key]));
    return;
  }
  s.setMarks(union(s.marked, [cur.key, next.key]));
  anchor = anchor ?? cur.key;
  keyFocus.key = next.key;
  s.select(next.key);
}

/** ⌘A: mark every Card of the open Card's group (a Board column as shown, a Waiting on me list group). No open Card or group: nothing. */
export function selectGroup(groups: Card[][]) {
  const s = useStore.getState();
  const group = groups.find((g) => g.some((c) => c.key === s.selected));
  if (group) s.setMarks(group.map((c) => c.key));
}
