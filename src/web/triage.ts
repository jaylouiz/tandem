// Triage on the web side, independent of any layout: buttons, keys and the palette all call `runTriage`.
// The targets are the marked Cards, else the selected Card.
import { useMemo } from "react";
import { NO_COORDINATOR, PHASES, type Card, type NextStep } from "../core/types.ts";
import { handNotice, invertChange, moveNotice, planMove, planTriage, relabel, skipReason, type HandedRecord, type MovePlan, type MoveTarget, type Plan, type TriageAction, type Unreached } from "../core/triage.ts";
import { api, currentCards, useCards, useStore, writeCard } from "./store.ts";

export interface TriageEntry {
  id: string;
  label: string;
  /** compact form for the bulk bar */
  short: string;
  key: string;
  action: TriageAction;
}

/** Every triage action, in the order the palette lists them. `key` is the single-key shortcut. */
export const TRIAGE_ENTRIES: TriageEntry[] = [
  { id: "next-design", short: "design", label: "Next step: design", key: "d", action: { kind: "next", step: "design" } },
  { id: "next-specify", short: "specify", label: "Next step: specify", key: "s", action: { kind: "next", step: "specify" } },
  { id: "next-build", short: "build", label: "Next step: build", key: "b", action: { kind: "next", step: "build" } },
  { id: "hold", short: "hold", label: "Hold Card / Release hold", key: "h", action: { kind: "hold" } },
  { id: "hand", short: "hand to agent", label: "Hand to agent", key: "a", action: { kind: "hand" } },
  { id: "priority-1", short: "P1", label: "Priority: 1 (highest)", key: "1", action: { kind: "priority", level: 1 } },
  { id: "priority-2", short: "P2", label: "Priority: 2", key: "2", action: { kind: "priority", level: 2 } },
  { id: "priority-3", short: "P3", label: "Priority: 3", key: "3", action: { kind: "priority", level: 3 } },
  { id: "priority-0", short: "no priority", label: "Priority: clear", key: "0", action: { kind: "priority", level: 0 } },
  { id: "fog", short: "wayfinder", label: "Needs wayfinder / Clear", key: "w", action: { kind: "fog" } },
];

export const entryForKey = (key: string) => TRIAGE_ENTRIES.find((e) => e.key === key);

/** Marked Cards (still among `cards`), else the selected Card. */
const pickTargets = (cards: Card[], marked: string[], selected: string | null): Card[] => {
  const m = cards.filter((c) => marked.includes(c.key));
  return m.length ? m : cards.filter((c) => c.key === selected);
};

export function triageTargets(s: Parameters<typeof currentCards>[0] & { marked: string[]; selected: string | null }): Card[] {
  return pickTargets(currentCards(s), s.marked, s.selected);
}

export function useTriageTargets(): Card[] {
  const cards = useCards();
  const marked = useStore((s) => s.marked);
  const selected = useStore((s) => s.selected);
  return useMemo(() => pickTargets(cards, marked, selected), [cards, marked, selected]);
}

/** Whether `action` does anything for at least one target (buttons and palette entries disable on false). `handed` is the store's record map. */
export const applicable = (action: TriageAction, targets: Card[], handed: Record<string, HandedRecord>) => targets.some((c) => skipReason(action, c, handed[c.key]) === null);

/** Why `action` does nothing for `targets` (a disabled button's title), or null when at least one target takes it. */
export function actionBlocked(action: TriageAction, targets: Card[], handed: Record<string, HandedRecord>): string | null {
  const reasons = targets.map((c) => skipReason(action, c, handed[c.key]));
  return reasons.some((r) => r === null) ? null : `Not applicable: ${[...new Set(reasons)].join(", ")}`;
}

/** The toast's lead for a single Card: what happened, not the toggle's two-way label ("Held" / "Released", not "Hold Card / Release hold"). */
export function outcomeOf(entry: TriageEntry, plan: Plan): string {
  const added = !!plan.steps[0]?.change.add.length;
  if (entry.action.kind === "hold") return added ? "Held" : "Released";
  if (entry.action.kind === "fog") return added ? "Marked needs wayfinder" : "Cleared needs wayfinder";
  return entry.label;
}

function summary(action: string, plan: Plan, total: number, failed: string[], first: Card): string {
  const done = plan.steps.length - failed.length;
  if (total === 1) {
    if (failed.length) return `Failed: ${failed[0]}`;
    if (plan.skipped.length) {
      const why = plan.skipped[0]!.reason;
      return (PHASES as string[]).includes(why) ? `Not applicable to a ${why} Card` : `Not applicable: ${why}`;
    }
    if (!plan.steps.length) return "Already set";
    return `${action} · ${first.repo.split("/")[1]}#${first.number}`;
  }
  const skipped = plan.skipped.length ? `, ${plan.skipped.length} skipped (${[...new Set(plan.skipped.map((s) => s.reason))].join(", ")})` : "";
  const unchanged = plan.unchanged.length ? `, ${plan.unchanged.length} already set` : "";
  const bad = failed.length ? `, ${failed.length} failed: ${failed[0]}` : "";
  return `${done} of ${total} updated${skipped}${unchanged}${bad}`;
}

/** Run a triage action on `only` (a Card's own buttons) or the current targets (keys, palette): optimistic, written per Card, rolled back per Card on failure. */
export async function runTriage(entry: TriageEntry, only?: Card[]) {
  const s = useStore.getState();
  const cfg = s.board?.workflow;
  const targets = only ?? triageTargets(s);
  if (!cfg || !targets.length) return;
  const plan = planTriage(entry.action, targets, cfg, s.handed);
  const failed: string[] = [];
  const undelivered: Card[] = [];
  const unreached: Unreached[] = [];
  const handed: Card[] = [];
  const hand = entry.action.kind === "hand";
  // the Card shows as handed at once; a failed or undelivered Push takes it back
  if (hand) s.markHanded(plan.steps.map((st) => st.card));
  await Promise.all(
    plan.steps.map(async ({ card, change }) => {
      if (hand) {
        try {
          const { push } = await api.post(`${api.cardPath(card)}/start`);
          // only an answered "nobody is there" offers a start; a Push Orca did not take says why (starting a coordinator would not fix it)
          if (push?.delivered) handed.push(card);
          else if (push?.reason && push.reason !== NO_COORDINATOR) unreached.push({ card, reason: push.reason });
          else undelivered.push(card);
        } catch (e) {
          failed.push(e instanceof Error ? e.message : String(e));
        }
        return;
      }
      const res = await writeCard(card, relabel(card, change, cfg), () => api.post(`${api.cardPath(card)}/labels`, change));
      // a Next step or hold re-steers the Card: its handed record goes once the write holds (a rolled-back write leaves the Card handed)
      if (!res.ok) failed.push(res.error);
      else if (entry.action.kind === "next" || entry.action.kind === "hold") s.clearHanded([card.key]);
    }),
  );
  if (hand) s.clearHanded(plan.steps.filter((st) => !handed.includes(st.card)).map((st) => st.card.key));
  let text = summary(outcomeOf(entry, plan), plan, targets.length, failed, targets[0]!);
  if (hand && plan.steps.length) text = handNotice(handed, undelivered, failed, unreached);
  s.setNotice({ key: (undelivered[0] ?? unreached[0]?.card ?? targets[0]!).key, text, canStart: undelivered.length > 0, start: undelivered, failed: failed.length > 0 || unreached.length > 0 });
  if (!only) s.clearMarks();
}

// ---- Moving Cards between Inbox and Backlog (Selection bar, drop, keys, palette) ----

export interface MoveEntry {
  id: string;
  label: string;
  key: string;
  to: MoveTarget;
}

/** `m` and `i`: Move to Backlog (with the bar's Next step) and Move to Inbox. */
export const MOVE_ENTRIES: MoveEntry[] = [
  { id: "move-backlog", label: "Move to Backlog", key: "m", to: "Backlog" },
  { id: "move-inbox", label: "Move to Inbox", key: "i", to: "Inbox" },
];

export const moveForKey = (key: string) => MOVE_ENTRIES.find((e) => e.key === key);

/** The picker's choice as `planMove` takes it: "keep" = each Card's own Next step. */
export const stepOf = (choice: NextStep | "keep"): NextStep | undefined => (choice === "keep" ? undefined : choice);

/** Why a move would change nothing for `targets`, or null when at least one Card moves (buttons disable on a reason, with it as the title). */
export function moveBlocked(to: MoveTarget, targets: Card[], cfg: Parameters<typeof planMove>[2], choice: NextStep | "keep"): string | null {
  const plan = planMove(targets, to, cfg, stepOf(choice));
  if (plan.steps.length) return null;
  if (plan.skipped.length) return `Not applicable: ${[...new Set(plan.skipped.map((x) => x.reason))].join(", ")}`;
  return `Already in ${to}`;
}

/** Move `cards` (default: the marked Cards, else the open Card): optimistic per Card, one notice with Undo, the selection cleared. */
export async function runMove(to: MoveTarget, only?: Card[]) {
  const s = useStore.getState();
  const cfg = s.board?.workflow;
  const targets = only ?? triageTargets(s);
  if (!cfg || !targets.length) return;
  const plan: MovePlan = planMove(targets, to, cfg, stepOf(s.moveStep));
  const failed: string[] = [];
  const moved: typeof plan.steps = [];
  await Promise.all(
    plan.steps.map(async (st) => {
      const { card, change } = st;
      const res = await writeCard(card, relabel(card, change, cfg), () => api.post(`${api.cardPath(card)}/labels`, change));
      if (res.ok) moved.push(st);
      else failed.push(res.error);
    }),
  );
  // a moved Card is re-steered: its handed record goes (the Card is no longer where it was handed)
  s.clearHanded(moved.map((m) => m.card.key));
  const undo = moved.length
    ? () => {
        const errors: string[] = [];
        void Promise.all(
          moved.map(async ({ card, change }) => {
            const back = invertChange(change);
            const fresh = currentCards(useStore.getState()).find((c) => c.key === card.key) ?? card;
            const res = await writeCard(fresh, relabel(fresh, back, cfg), () => api.post(`${api.cardPath(card)}/labels`, back));
            if (!res.ok) errors.push(res.error);
          }),
        ).then(() => useStore.getState().setNotice({ key: moved[0]!.card.key, text: errors.length ? `Undo failed: ${errors[0]}` : "Move undone", canStart: false, failed: errors.length > 0 }));
      }
    : undefined;
  useStore.getState().setNotice({ key: (moved[0]?.card ?? targets[0]!).key, text: moveNotice(plan, to, cfg, failed), canStart: false, failed: failed.length > 0, undo });
  useStore.getState().clearMarks();
}
