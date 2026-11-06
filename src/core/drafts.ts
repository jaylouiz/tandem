// Feedback drafts: what was typed and picked in a Feedback panel and not sent yet. One draft per Card + request, so
// a request id (`D1`, repeated on almost every Card) on another Card never shares one.
import type { Card } from "./types.ts";

/** A panel's draft: the fields it wants kept (text, picks, Push). Opaque to the store. */
export type Draft = Record<string, unknown>;

export const draftKey = (cardKey: string, id: string) => `${cardKey}\u0000${id}`;

/** The ids of the panels' drafts. A decision panel uses its request id (`D1`). */
export const roundDraftId = (round: number) => `round-${round}`;
export const prDraftId = (requestId: string | null) => `pr-${requestId ?? ""}`;
export const AGENT_DRAFT_ID = "agent-decisions";

/** The draft ids of the Feedback panels this Card shows right now. */
export function liveDraftIds(card: Card): string[] {
  const w = card.waiting;
  const ids: string[] = [];
  if (w?.kind === "decision" && w.requestId) ids.push(w.requestId);
  const round = card.rounds.at(-1);
  if (w?.kind === "design-round" && round) ids.push(roundDraftId(round.round));
  if (w?.kind === "pr-approval") ids.push(prDraftId(w.requestId));
  if (card.decisionsToAccept.length) ids.push(AGENT_DRAFT_ID);
  return ids;
}

/**
 * Drop the drafts whose request no longer exists on its Card (answered elsewhere, resolved, a newer round). A draft of a Card that
 * is not in `cards` stays: a snapshot that lacks the Card (a repo still syncing) must not eat what was typed. Returns `drafts` itself when nothing was dropped.
 */
export function pruneDrafts<T extends Draft>(drafts: Record<string, T>, cards: Card[]): Record<string, T> {
  const live = new Map(cards.map((c) => [c.key, new Set(liveDraftIds(c))]));
  const keep = Object.entries(drafts).filter(([k]) => {
    const [cardKey, id] = k.split("\u0000") as [string, string];
    const ids = live.get(cardKey);
    return !ids || ids.has(id);
  });
  return keep.length === Object.keys(drafts).length ? drafts : Object.fromEntries(keep);
}
