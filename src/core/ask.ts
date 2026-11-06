// What a Card asks of the developer, in one line: the list row's second line and the pane header. Pure.
import type { AgentDecision, Card, DecisionState } from "./types.ts";

export type Kind = "decision" | "design-round" | "pr-approval" | "look" | "pickup";

export const KIND_LABEL: Record<Kind, string> = {
  decision: "Decision",
  "design-round": "Design round",
  "pr-approval": "PR approval",
  look: "Look",
  pickup: "Awaiting pickup",
};

/** Which kind of Feedback (or Look, or pickup) a Card is in the Waiting on me view; null when none. */
export function kindOf(card: Card): Kind | null {
  if (card.waiting) return card.waiting.kind;
  if (card.needsLook && !card.seenAt) return "look";
  if (card.awaitingPickup) return "pickup";
  return null;
}

/** new: carries `agent-decided` and nobody replied; challenged: a reply asks for a change; accepted: the rest. */
export function decisionState(card: Card, d: AgentDecision): DecisionState {
  return d.challenge !== null ? "challenged" : card.decisionsToAccept.includes(d.id) ? "new" : "accepted";
}

const firstLine = (t: string) => t.split("\n")[0]!.replace(/[*_`#]/g, "").trim();

/** The one line that says what is asked, so a row reads without opening the Card. `kind`: the row's own, for a Seen Card that is still listed in To look at. */
export function askOf(card: Card, kind: Kind | null = kindOf(card)): string {
  const req = card.requests.find((r) => r.id === card.waiting?.requestId);
  switch (kind) {
    case "decision":
      return firstLine(req?.question ?? "Decision needed");
    case "design-round": {
      const r = card.rounds.at(-1);
      return `Round ${r?.round ?? 1}, ${r?.variants.length ?? 0} variants: ${firstLine(req?.question ?? r?.question ?? "")}`;
    }
    case "pr-approval":
      return `PR #${card.pullRequest?.number}: ${firstLine(req?.question ?? "approve or hold")}`;
    case "look":
      return firstLine(card.look?.headline ?? "Take a Look at the result");
    case "pickup": {
      const r = [...card.requests].reverse().find((x) => x.answer);
      return r?.answer ? `You answered “${firstLine(r.answer)}”, the run has not resumed` : "Your Feedback is on the issue, the run has not resumed";
    }
    default:
      return "";
  }
}

/** When the ask began: the wait, the close (Look) or the last move (pickup). */
export const sinceOf = (card: Card, kind: Kind | null = kindOf(card)): string | null => card.waiting?.since ?? (kind === "look" ? card.closedAt : card.updatedAt);
