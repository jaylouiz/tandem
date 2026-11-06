// Derives a Card (Phase, Next step, what waits on the developer) from raw GitHub data. Pure.
import { digestThread } from "./contract.ts";
import type { PhaseCondition, WorkflowConfig } from "./config.ts";
import type { Card, NextStep, Phase, RawIssue, RawPullRequest, Waiting } from "./types.ts";
import { PHASES } from "./types.ts";

/** Identity of one "waiting on me" event, shared by the page and the server notifier so each notifies once. */
export const waitingId = (c: Pick<Card, "key" | "waiting">) => (c.waiting ? `${c.key}:${c.waiting.kind}:${c.waiting.since}` : null);

export const cardKey = (repo: string, number: number) => `${repo}#${number}`;

function matches(issue: RawIssue, pr: RawPullRequest | null, when: PhaseCondition): boolean {
  if (when.state === "closed" && !(issue.state === "closed" && issue.stateReason !== "not_planned")) return false;
  if (when.state === "open" && issue.state !== "open") return false;
  if (when.anyLabel && !when.anyLabel.some((l) => issue.labels.includes(l))) return false;
  if (when.openPr && pr?.state !== "open") return false;
  return true;
}

export function phaseOf(issue: RawIssue, pr: RawPullRequest | null, cfg: WorkflowConfig): Phase {
  return cfg.phaseRules.find((r) => matches(issue, pr, r.when))?.phase ?? "Inbox";
}

export function priorityOf(labels: string[], cfg: WorkflowConfig): number | null {
  const ns = labels.flatMap((l) => (l.startsWith(cfg.priorityLabelPrefix) && /^[1-3]$/.test(l.slice(cfg.priorityLabelPrefix.length)) ? [Number(l.slice(cfg.priorityLabelPrefix.length))] : []));
  return ns.length ? Math.min(...ns) : null;
}

/** A fog Card has no Next step until it is cleared (agents never start wayfinder). */
export function nextStepOf(labels: string[], cfg: WorkflowConfig): NextStep | null {
  if (labels.includes(cfg.fogLabel)) return null;
  for (const [label, step] of Object.entries(cfg.nextStep)) if (labels.includes(label)) return step;
  return null;
}

/** The PR that matters: an open one first, then the latest merged one. */
function mainPr(prs: RawPullRequest[]): RawPullRequest | null {
  const sorted = [...prs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return sorted.find((p) => p.state === "open") ?? sorted.find((p) => p.state === "merged") ?? sorted[0] ?? null;
}

export function buildCard(issue: RawIssue, cfg: WorkflowConfig, seenAt: string | null): Card {
  const pr = mainPr(issue.pullRequests);
  const phase = phaseOf(issue, pr, cfg);
  const digest = digestThread(issue.comments);
  const has = (l: string) => issue.labels.includes(l);

  const openRequest = [...digest.requests].reverse().find((r) => !r.resolved) ?? null;
  const parked = has(cfg.needsDecisionLabel) && openRequest !== null;
  const answered = parked && openRequest.answer !== null;

  let waiting: Waiting | null = null;
  if (issue.state === "open") {
    if (parked && !answered) {
      const kind =
        pr?.state === "open"
          ? "pr-approval"
          : phase === "UX Design" && digest.rounds.length > 0
            ? "design-round"
            : "decision";
      waiting = { kind, since: openRequest.createdAt, requestId: openRequest.id };
    }
  }
  // an agent decision never holds the agent (agent-workflow), so it is not Waiting on me; the Decided tab lists it.
  // On a closed issue there is nothing left to accept or challenge (a comment would land on the closed issue)
  const decisionsToAccept = issue.state === "open" && has(cfg.agentDecidedLabel) ? digest.agentDecisions.filter((d) => d.challenge === null).map((d) => d.id) : [];

  const wentThroughDesign = digest.rounds.length > 0 || /^## UX decision/m.test(issue.body);
  const needsLook = phase === "Done" && (wentThroughDesign || cfg.lookLabels.some(has));

  return {
    key: cardKey(issue.repo, issue.number),
    repo: issue.repo,
    number: issue.number,
    title: issue.title,
    body: issue.body,
    url: issue.url,
    state: issue.state,
    labels: issue.labels,
    phase,
    nextStep: nextStepOf(issue.labels, cfg),
    onHold: cfg.holdLabels.some(has),
    priority: priorityOf(issue.labels, cfg),
    fog: has(cfg.fogLabel),
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    closedAt: issue.closedAt,
    waiting,
    awaitingPickup: answered,
    requests: digest.requests,
    agentDecisions: digest.agentDecisions,
    decisionsToAccept,
    rounds: digest.rounds,
    look: digest.look,
    pullRequest: pr,
    needsLook,
    seenAt: needsLook ? seenAt : (seenAt ?? issue.closedAt),
  };
}

/** Whether a Card is on the Board at `now` (Done/Look retention rules). Not-planned closes never are. */
export function onBoard(card: Card, cfg: WorkflowConfig, now: Date): boolean {
  if (card.state === "closed" && card.phase !== "Done") return false;
  if (card.phase !== "Done") return true;
  if (card.needsLook && !card.seenAt) return true;
  if (!card.seenAt) return false;
  return now.getTime() - Date.parse(card.seenAt) < cfg.seenRetentionDays * 86_400_000;
}

/** Board column order: waiting first, then priority (1 first, none last), then last moved. */
export function boardOrder(a: Card, b: Card): number {
  return Number(!!b.waiting) - Number(!!a.waiting) || (a.priority ?? 9) - (b.priority ?? 9) || b.updatedAt.localeCompare(a.updatedAt);
}

/** Board order inside a Phase when the Board is grouped by repo: lane by lane (repos in the given order), each lane in Board order. */
export function laneOrder(repos: string[] | null): (a: Card, b: Card) => number {
  if (!repos) return boardOrder;
  return (a, b) => repos.indexOf(a.repo) - repos.indexOf(b.repo) || boardOrder(a, b);
}

/** Closeness to Done: the Phase, and inside Build an open PR is closer than spec or implementation. */
const closeness = (c: Card) => PHASES.indexOf(c.phase) * 2 + (c.pullRequest?.state === "open" ? 1 : 0);

/** Waiting on me: closest to Done first, then oldest. */
export function waitingOnMe(cards: Card[]): Card[] {
  return cards
    .filter((c) => c.waiting)
    .sort((a, b) => {
      const p = closeness(b) - closeness(a);
      return p !== 0 ? p : a.waiting!.since.localeCompare(b.waiting!.since);
    });
}

/** "To look at": Done Cards that need a Look and are not Seen, oldest first. `keep` (the Card the developer just opened, now Seen) stays in the list. */
export function toLookAt(cards: Card[], keep: string | null = null): Card[] {
  return cards.filter((c) => c.needsLook && (!c.seenAt || c.key === keep)).sort((a, b) => (a.closedAt ?? "").localeCompare(b.closedAt ?? ""));
}
