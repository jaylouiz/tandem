// Triage actions on Cards (brief jobs 7 and 8). Pure: which labels an action writes, which Cards it applies to,
// and how a Card looks right after the write (optimistic). The UI (buttons, keys, palette, bulk) only calls this.
import { phaseOf, nextStepOf, priorityOf } from "./card.ts";
import type { WorkflowConfig } from "./config.ts";
import type { Card, NextStep, RawIssue } from "./types.ts";

export type TriageAction =
  | { kind: "next"; step: NextStep }
  | { kind: "hold" }
  | { kind: "hand" }
  | { kind: "priority"; level: 0 | 1 | 2 | 3 } // 0 clears
  | { kind: "fog" };

export interface LabelChange {
  add: string[];
  remove: string[];
}

const laneLabels = (cfg: WorkflowConfig) => Object.keys(cfg.nextStep);
const laneOf = (step: NextStep, cfg: WorkflowConfig) => Object.entries(cfg.nextStep).find(([, s]) => s === step)?.[0] ?? null;

/** A successful "Hand to agent" the coordinator has not picked up yet (Push leaves no trace on GitHub). */
export interface HandedRecord {
  at: number;
  nextStep: NextStep;
}

/** The record counts only while it can still be true: Backlog, open, not on hold, same Next step. GitHub's Phase takes over once the coordinator starts. */
export const handedValid = (card: Card, rec: HandedRecord | undefined): rec is HandedRecord =>
  !!rec && card.state === "open" && card.phase === "Backlog" && !card.onHold && card.nextStep === rec.nextStep;

/** `handed` without the records whose Card moved on (or is gone from `cards`); the same object when nothing changed. */
export function pruneHanded(handed: Record<string, HandedRecord>, cards: Card[]): Record<string, HandedRecord> {
  const live = new Map(cards.map((c) => [c.key, c]));
  const keep = Object.entries(handed).filter(([k, rec]) => {
    const c = live.get(k);
    return c ? handedValid(c, rec) : false;
  });
  return keep.length === Object.keys(handed).length ? handed : Object.fromEntries(keep);
}

/** Why an action does not apply to a Card, or null when it does. `handed` is the Card's record, if any. */
export function skipReason(action: TriageAction, card: Card, handed?: HandedRecord): string | null {
  if (card.state === "closed" || card.phase === "Done") return "Done";
  if (action.kind === "hold" || action.kind === "priority") return null;
  if (action.kind === "fog") return card.phase === "Inbox" ? null : card.phase;
  if (card.phase !== "Inbox" && card.phase !== "Backlog") return card.phase;
  if (action.kind === "hand") {
    if (card.fog) return "needs wayfinder";
    if (!card.nextStep) return "no Next step";
    if (card.waiting) return "waiting on you";
    if (handedValid(card, handed)) return "already handed";
  }
  return null;
}

/** Labels one action adds and removes on one Card. `release` only matters for hold (toggle direction). */
export function triageLabels(action: TriageAction, card: Card, cfg: WorkflowConfig, release = card.labels.includes(action.kind === "fog" ? cfg.fogLabel : cfg.holdLabel)): LabelChange {
  const has = (l: string) => card.labels.includes(l);
  switch (action.kind) {
    case "next": {
      const lane = laneOf(action.step, cfg);
      if (!lane) return { add: [], remove: [] };
      const drop = [...laneLabels(cfg).filter((l) => l !== lane), ...inboxLabels(cfg), cfg.fogLabel].filter(has);
      return { add: has(lane) ? [] : [lane], remove: drop };
    }
    case "hold":
      return release ? { add: [], remove: [cfg.holdLabel].filter(has) } : { add: has(cfg.holdLabel) ? [] : [cfg.holdLabel], remove: [] };
    case "hand":
      return { add: [], remove: [] };
    case "priority": {
      const mine = action.level ? `${cfg.priorityLabelPrefix}${action.level}` : null;
      const others = card.labels.filter((l) => l.startsWith(cfg.priorityLabelPrefix) && l !== mine);
      return { add: mine && !has(mine) ? [mine] : [], remove: others };
    }
    case "fog":
      return release ? { add: [], remove: [cfg.fogLabel].filter(has) } : { add: has(cfg.fogLabel) ? [] : [cfg.fogLabel], remove: [] };
  }
}

export interface Step {
  card: Card;
  change: LabelChange;
}

export interface Plan {
  steps: Step[];
  /** applicable but nothing to write (already there) */
  unchanged: Card[];
  skipped: { card: Card; reason: string }[];
}

/** Apply an action to a set of Cards. Hold and fog are toggles for the set: release only when every target is held. */
export function planTriage(action: TriageAction, cards: Card[], cfg: WorkflowConfig, handed: Record<string, HandedRecord> = {}): Plan {
  const plan: Plan = { steps: [], unchanged: [], skipped: [] };
  const ok: Card[] = [];
  for (const card of cards) {
    const reason = skipReason(action, card, handed[card.key]);
    if (reason) plan.skipped.push({ card, reason });
    else ok.push(card);
  }
  const toggled = action.kind === "fog" ? cfg.fogLabel : cfg.holdLabel;
  const release = ok.length > 0 && ok.every((c) => c.labels.includes(toggled));
  for (const card of ok) {
    const change = triageLabels(action, card, cfg, release);
    if (action.kind === "hand") plan.steps.push({ card, change });
    else if (change.add.length || change.remove.length) plan.steps.push({ card, change });
    else plan.unchanged.push(card);
  }
  return plan;
}

/** The Card as it will look once `change` is written. */
export function relabel(card: Card, change: LabelChange, cfg: WorkflowConfig): Partial<Card> {
  const labels = [...new Set([...card.labels.filter((l) => !change.remove.includes(l)), ...change.add])];
  const stub = { state: card.state, stateReason: null, labels } as RawIssue;
  return {
    labels,
    phase: phaseOf(stub, card.pullRequest, cfg),
    nextStep: nextStepOf(labels, cfg),
    onHold: cfg.holdLabels.some((l) => labels.includes(l)),
    priority: priorityOf(labels, cfg),
    fog: labels.includes(cfg.fogLabel),
  };
}

// ---- Moving Cards between Inbox and Backlog (a person's moves; agents and PR state own the other Phases) ----

/** The Next step a Card gets when it moves to Backlog without one. */
export const DEFAULT_MOVE_STEP: NextStep = "specify";

export type MoveTarget = "Inbox" | "Backlog";

/** The label that puts a Card into Inbox by itself, read from the Phase rules (never a literal label in UI code). */
export function inboxLabel(cfg: WorkflowConfig): string | null {
  return inboxLabels(cfg)[0] ?? null;
}

/** Every label the Phase rules read as "Inbox by itself": a Card leaves Inbox only when all of them are gone. */
export function inboxLabels(cfg: WorkflowConfig): string[] {
  return cfg.phaseRules.filter((r) => r.phase === "Inbox" && r.when.anyLabel?.length && !r.when.state && !r.when.openPr).flatMap((r) => r.when.anyLabel!);
}

export interface MovePlan {
  steps: Step[];
  /** already in the target Phase with the wanted Next step */
  same: Card[];
  skipped: { card: Card; reason: string }[];
}

/** Move `cards` to Inbox or Backlog. Backlog: each Card keeps its Next step, else `step` (else specify); `step` overrides for all. */
export function planMove(cards: Card[], to: MoveTarget, cfg: WorkflowConfig, step?: NextStep): MovePlan {
  const plan: MovePlan = { steps: [], same: [], skipped: [] };
  const inbox = inboxLabel(cfg);
  for (const card of cards) {
    if (card.state === "closed" || (card.phase !== "Inbox" && card.phase !== "Backlog")) {
      plan.skipped.push({ card, reason: card.state === "closed" ? "Done" : card.phase });
    } else if (to === "Backlog") {
      if (card.fog) {
        plan.skipped.push({ card, reason: "needs wayfinder" });
        continue;
      }
      const s = step ?? card.nextStep ?? DEFAULT_MOVE_STEP;
      if (!laneOf(s, cfg)) {
        plan.skipped.push({ card, reason: `no lane label for ${s}` });
        continue;
      }
      const change = triageLabels({ kind: "next", step: s }, card, cfg);
      if (!change.add.length && !change.remove.length) plan.same.push(card);
      else plan.steps.push({ card, change });
    } else if (card.phase === "Inbox") {
      plan.same.push(card);
    } else if (!inbox) {
      plan.skipped.push({ card, reason: "no Inbox label in the Phase rules" });
    } else {
      plan.steps.push({ card, change: { add: card.labels.includes(inbox) ? [] : [inbox], remove: card.labels.filter((l) => laneLabels(cfg).includes(l)) } });
    }
  }
  return plan;
}

/** The change that takes `change` back (Undo). */
export const invertChange = (change: LabelChange): LabelChange => ({ add: change.remove, remove: change.add });

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** The notice after a move: how many Cards went where (with the Next steps they got), what was skipped, already there, or failed. */
export function moveNotice(plan: MovePlan, to: MoveTarget, cfg: WorkflowConfig, failed: string[]): string {
  const done = plan.steps.length - failed.length;
  const steps = [...new Set(plan.steps.map((s) => relabel(s.card, s.change, cfg).nextStep).filter((n): n is NextStep => !!n))].map(cap);
  const where = to === "Backlog" && steps.length ? `${to} (${steps.join(", ")})` : to;
  const who = plan.steps.length === 1 ? `${repoName(plan.steps[0]!.card)}#${plan.steps[0]!.card.number}` : `${done} ${done === 1 ? "Card" : "Cards"}`;
  const head = done > 0 ? `Moved ${who} to ${where}` : plan.same.length && !failed.length ? `Already in ${to}` : "Nothing moved";
  const parts = [head];
  if (plan.skipped.length) parts.push(`${plan.skipped.length} skipped (${[...new Set(plan.skipped.map((x) => x.reason))].join(", ")})`);
  if (plan.same.length && !head.startsWith("Already")) parts.push(`${plan.same.length} already in ${to}`);
  if (failed.length) parts.push(`${failed.length} failed: ${failed[0]}`);
  return parts.join(", ");
}

const repoName = (card: Card) => card.repo.split("/")[1]!;

/** A Card whose Push Orca did not take for another reason than "no coordinator running" (Orca unreachable, a Run unreadable): starting a coordinator would not help. */
export interface Unreached {
  card: Card;
  reason: string;
}

/** The notice after "Hand to agent": what reached a coordinator, for which repos none runs, which Pushes failed on Orca itself (`unreached`, with the first reason), and what failed. */
export function handNotice(handed: Card[], undelivered: Card[], failed: string[] = [], unreached: Unreached[] = []): string {
  const bad = failed.length ? `${failed.length} failed: ${failed[0]}` : "";
  if (!handed.length && !undelivered.length && !unreached.length) return failed.length === 1 ? `Failed: ${failed[0]}` : bad;
  const repos = [...new Set(undelivered.map((c) => repoName(c)))];
  const only = !handed.length && !undelivered.length; // the unreached Cards are all there is to say
  const parts: string[] = [];
  if (handed.length && !undelivered.length && !unreached.length) parts.push(`Handed to the coordinator · ${handed.length === 1 ? handed[0]!.nextStep : `${handed.length} Cards`}`);
  else if (handed.length) parts.push(`Handed ${handed.length} ${handed.length === 1 ? "Card" : "Cards"} to the coordinator`);
  if (undelivered.length) {
    const bare = !handed.length && !unreached.length && repos.length === 1 && undelivered.length === 1 && !failed.length;
    parts.push(bare ? "No coordinator running" : `${parts.length ? "no" : "No"} coordinator running for ${repos.join(", ")}`);
  }
  if (unreached.length) {
    const who = only && unreached.length === 1 ? "Not handed over" : `${unreached.length} ${unreached.length === 1 ? "Card" : "Cards"} not handed over`;
    parts.push(`${who} (${unreached[0]!.reason})`);
  }
  if (bad) parts.push(bad);
  return parts.join("; ");
}

/** The notice after "Start coordinator": repos that started and repos that did not, with the first reason. */
export function startNotice(started: string[], failed: { repo: string; error: string }[]): string {
  const ok = started.length ? `Coordinator starting for ${started.join(", ")}` : "";
  if (!failed.length) return ok;
  const bad = `Could not start coordinator for ${failed.map((f) => f.repo).join(", ")}: ${failed[0]!.error}`;
  return ok ? `${ok}; ${bad}` : bad;
}

/** One coordinator start per repo, with every Card of that repo whose Push was not delivered. */
export function startRequests(cards: Card[]): { repo: string; numbers: number[] }[] {
  const byRepo = new Map<string, number[]>();
  for (const c of cards) byRepo.set(c.repo, [...(byRepo.get(c.repo) ?? []), c.number]);
  return [...byRepo].map(([repo, numbers]) => ({ repo, numbers }));
}
