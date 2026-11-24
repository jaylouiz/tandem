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
      const qs = r?.questions.length ?? 0;
      if (r && qs) return `Round ${r.round}, ${qs} question${qs > 1 ? "s" : ""}: ${firstLine(req?.question ?? "")}`;
      const main = r?.variants.filter((v) => v.axis === null).length ?? 0;
      const axes = r?.axes.length ? ` plus ${r.axes.map((a) => a.name).join(", ")}` : "";
      return `Round ${r?.round ?? 1}, ${main} variants${axes}: ${firstLine(req?.question ?? r?.question ?? "")}`;
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

/**
 * Focus, coming back: which of the asks began after `since` (when Focus was last left) and which were open before. Order is kept.
 * Without a `since` (the first visit) nothing is "new": everything is in `older`.
 */
export function splitNew(cards: Card[], since: string | null): { fresh: Card[]; older: Card[] } {
  const at = since ? Date.parse(since) : NaN;
  if (Number.isNaN(at)) return { fresh: [], older: cards };
  const isNew = (c: Card) => Date.parse(sinceOf(c) ?? "") > at;
  return { fresh: cards.filter(isNew), older: cards.filter((c) => !isNew(c)) };
}

/** What the developer got through in Focus, in their words: "3 answered and 2 marked Seen". A Look is marked Seen, every other kind is answered. */
export function tally(done: Kind[]): string {
  const seen = done.filter((k) => k === "look").length;
  const answered = done.length - seen;
  return [answered ? `${answered} answered` : "", seen ? `${seen} marked Seen` : ""].filter(Boolean).join(" and ");
}

// ---- The Card sheet (#17): one page, the ask first, then folds that open in place ----

export type FoldId = "issue" | "decided" | "activity";

/** The sheet shows a panel that asks something of the developer: a Feedback panel, or the Look of a Done Card. */
export const hasAskPanel = (card: Pick<Card, "waiting" | "phase" | "needsLook">) => !!card.waiting || (card.phase === "Done" && card.needsLook);

/**
 * Which folds are open when the Card opens (afterwards they are the developer's): the issue text when nothing is asked, Decided when it
 * holds an agent decision nobody has looked at, Activity never.
 */
export const foldStart = (card: Pick<Card, "waiting" | "phase" | "needsLook" | "decisionsToAccept">): Record<FoldId, boolean> => ({
  issue: !hasAskPanel(card),
  decided: card.decisionsToAccept.length > 0,
  activity: false,
});

/** The requests the developer answered (or that were resolved), and the rounds they can only read: what the Decided fold lists. */
export function decidedParts(card: Pick<Card, "requests" | "agentDecisions" | "decisionsToAccept" | "rounds" | "waiting">) {
  const answers = card.requests.filter((r) => r.answer !== null || r.resolved).length;
  const roundWaits = card.waiting?.kind === "design-round" && card.rounds.length > 0;
  return { answers, decisions: card.agentDecisions.length, fresh: card.decisionsToAccept.length, rounds: card.rounds.length - (roundWaits ? 1 : 0) };
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The Decided fold in one line: `2 answers · 1 agent decision, 1 new · 1 earlier round` (only the parts that exist); "" when nothing is decided. */
export function decidedSummary(card: Parameters<typeof decidedParts>[0]): string {
  const p = decidedParts(card);
  return [
    p.answers ? count(p.answers, "answer") : "",
    p.decisions ? `${count(p.decisions, "agent decision")}${p.fresh ? `, ${p.fresh} new` : ""}` : "",
    p.rounds ? count(p.rounds, card.waiting?.kind === "design-round" ? "earlier round" : "design round") : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The Issue fold in one line: the first 90 characters of the issue text without its Markdown. */
export function issueSummary(body: string): string {
  const text = body
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)|<img\b[^>]*>/gi, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text ? (text.length > 90 ? `${text.slice(0, 89).trimEnd()}…` : text) : "No description";
}
