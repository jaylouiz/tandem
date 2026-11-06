// Pointer drag of Cards between Phases (D3: pointer events, so the ghost can show a stack with a count).
// A drop on Inbox or Backlog is a move (`runMove`); the other Phases are set by agents and PR state.
import type { PointerEvent } from "react";
import type { Card, Phase } from "../core/types.ts";
import { autoScroll } from "./autoscroll.ts";
import { currentCards, useStore } from "./store.ts";
import { moveBlocked, runMove } from "./triage.ts";

export const DROP_TARGETS: Phase[] = ["Inbox", "Backlog"];
export const REFUSAL: Partial<Record<Phase, string>> = {
  "UX Design": "Agents move Cards here: use Hand to agent",
  Build: "Agents move Cards here: use Hand to agent",
  Done: "Done follows the merged PR",
};

/** Why a drop on `to` would move none of `cards`, or null when it moves at least one. The column highlight, the drop note and the drop itself all ask this: one rule set (`moveBlocked`). */
export function dropBlocked(to: Phase, cards: Card[]): string | null {
  if (!DROP_TARGETS.includes(to)) return REFUSAL[to] ?? "Cannot move Cards here";
  const s = useStore.getState();
  const cfg = s.board?.workflow;
  return cfg ? moveBlocked(to as "Inbox" | "Backlog", cards, cfg, s.moveStep) : "Board not loaded";
}

/** The dragged Cards, as they are now. */
export const dragCards = (keys: string[]): Card[] => currentCards(useStore.getState()).filter((c) => keys.includes(c.key));

const THRESHOLD = 5;
/** A finished drag is followed by a click on the release target (a common ancestor when it is not the Card): swallow that one click, then stop listening. Never sticky, so a later click or Enter on a Card works. */
function swallowReleaseClick() {
  const eat = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener("click", eat, { capture: true, once: true });
  // the click, if any, fires right after the pointer-up: drop the listener once that is over
  setTimeout(() => window.removeEventListener("click", eat, true), 0);
}

/** After Esc the button is still down: arm the swallow for the release. A pointer-down first (a release outside the window was missed) disarms it. */
function swallowClickAfterRelease() {
  const up = () => {
    window.removeEventListener("pointerdown", disarm, true);
    swallowReleaseClick();
  };
  const disarm = () => window.removeEventListener("pointerup", up, true);
  window.addEventListener("pointerup", up, { capture: true, once: true });
  window.addEventListener("pointerdown", disarm, { capture: true, once: true });
}

/** The Phase column under the point; grouped by repo also the lane (the same Phase has one column per lane). */
const columnAt = (x: number, y: number): { over: Phase | null; lane: string | null } => {
  const el = document.elementsFromPoint(x, y).find((e): e is HTMLElement => e instanceof HTMLElement && !!e.dataset.column);
  return { over: (el?.dataset.column as Phase | undefined) ?? null, lane: el?.dataset.lane ?? null };
};

/** Pointer down on a Card: a drag starts after 5px. The whole selection moves when the Card is in it, else just the Card. */
export function startDrag(card: Card, e: PointerEvent) {
  if (e.button !== 0 || e.shiftKey || e.metaKey || e.ctrlKey) return;
  const sx = e.clientX;
  const sy = e.clientY;
  let on = false;
  let keys: string[] = [];
  let at = { x: sx, y: sy };
  let halt: (() => void) | null = null;
  const show = () => {
    const next = { keys, x: at.x, y: at.y, ...columnAt(at.x, at.y) };
    const now = useStore.getState().drag;
    // a scroll of the Card pane or a list (the listener sees every scroller) changes nothing here
    if (now && now.keys === keys && now.x === next.x && now.y === next.y && now.over === next.over && now.lane === next.lane) return;
    useStore.getState().setDrag(next);
  };
  const stop = () => {
    halt?.();
    window.removeEventListener("scroll", show, true);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("keydown", esc, true);
    delete document.body.dataset.dragging;
    useStore.getState().setDrag(null);
  };
  const move = (ev: globalThis.PointerEvent) => {
    if (!on) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < THRESHOLD) return;
      on = true;
      const s = useStore.getState();
      keys = s.marked.includes(card.key) ? s.marked : [card.key];
      if (!s.marked.includes(card.key)) s.clearMarks();
      document.body.dataset.dragging = "";
      // held near the Board's edge it scrolls; the column under a still pointer changes with every scroll (also a wheel's)
      halt = autoScroll(() => at);
      window.addEventListener("scroll", show, true);
    }
    at = { x: ev.clientX, y: ev.clientY };
    show();
  };
  const end = (ev: globalThis.PointerEvent) => {
    const { over } = columnAt(ev.clientX, ev.clientY);
    stop();
    if (!on) return;
    swallowReleaseClick();
    if (!over) return;
    const cards = dragCards(keys);
    const blocked = dropBlocked(over, cards);
    if (blocked) {
      // Inbox or Backlog dropped on its own column is no news; any other reason is the one the column showed
      if (!(DROP_TARGETS.includes(over) && cards.every((c) => c.phase === over))) useStore.getState().setNotice({ key: card.key, text: blocked, canStart: false });
      return;
    }
    void runMove(over as "Inbox" | "Backlog", cards);
  };
  // the browser took the gesture (scroll, a system dialog): drop the drag, nothing moves
  const cancel = () => {
    on = false;
    stop();
  };
  const esc = (ev: KeyboardEvent) => {
    if (ev.key !== "Escape") return;
    ev.stopPropagation();
    if (on) swallowClickAfterRelease(); // the release still clicks, later
    on = false;
    stop();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("keydown", esc, true);
}
