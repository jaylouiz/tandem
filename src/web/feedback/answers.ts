// What an answer is and how it is sent, per kind of Feedback: the draft (per Card + request, `useDraft`), whether it can be sent, the
// request it makes (`core/answer.ts`) and the send. The Card pane's panels (`components/Feedback.tsx`) and the covers of Focus
// (`components/focus/`) both stand on these, so there is one rule for what gets written. How an answer is given (pick then Send in
// the panels, a click that sends in Focus) is the caller's.
import { canSend, decisionFeedback, prFeedback, roundFeedback, type Feedback } from "../../core/answer.ts";
import type { PrVerdict } from "../../core/contract.ts";
import { draftKey, prDraftId, roundDraftId } from "../../core/drafts.ts";
import type { Card, DesignRound } from "../../core/types.ts";
import { giveFeedback, useDraft, useStore } from "../store.ts";

/** What an answered Card looks like until the next snapshot. */
const DONE: Partial<Card> = { waiting: null, awaitingPickup: true };

/** Wraps a send: Focus holds the ask while the write runs and keeps the receipt (`focus/session.ts`). Default: just run it. */
export type SendVia = (card: Card, feedback: Feedback, run: () => Promise<boolean>) => Promise<boolean>;
const direct: SendVia = (_card, _feedback, run) => run();

/** Send `f` through the one write path (`giveFeedback`: optimistic patch, rollback, the failure on the Card); the draft goes once it went through. */
function sendFeedback(card: Card, f: Feedback | null, push: boolean, dKey: string, via: SendVia): Promise<boolean> {
  if (!f || !canSend(f)) return Promise.resolve(false);
  const patch = f.action === "pr" && f.body.verdict === "hold" ? { ...DONE, onHold: true } : DONE;
  return via(card, f, async () => {
    const sent = await giveFeedback(card, f.action, { ...f.body, push }, patch);
    if (sent) useStore.getState().clearDraft(dKey);
    return sent;
  });
}

/** A decision request: one option, a note, or both. */
export function useDecisionAnswer(card: Card, via: SendVia = direct) {
  const req = card.requests.find((r) => r.id === card.waiting?.requestId);
  const dKey = draftKey(card.key, req?.id ?? "");
  const [{ choice, text, push }, edit] = useDraft(dKey, { choice: null as string | null, text: "", push: true });
  /** the Feedback for this choice and note, sendable or not; null without a request */
  const feedbackOf = (c: string | null, note: string) => (req ? decisionFeedback(req.id, c, note) : null);
  const feedback = feedbackOf(choice, text);
  const sendWith = (c: string | null, note: string) => sendFeedback(card, feedbackOf(c, note), push, dKey, via);
  return { req, choice, text, push, edit, feedback, feedbackOf, canSend: !!feedback && canSend(feedback), send: () => sendWith(choice, text), sendWith, clear: () => useStore.getState().clearDraft(dKey) };
}

/** The three verdicts in key order, each with what it sets off (`prVerdictComment`; Hold also labels the issue do-not-merge). */
export const VERDICTS: [PrVerdict, string, string][] = [
  ["approve", "Approve", "The agent may merge"],
  ["hold", "Hold merge", "The PR stays open and is labelled do-not-merge"],
  ["send-back", "Send back", "Back to the agent, with your note"],
];

/** A PR approval: one verdict and a note. Send back needs the note. */
export function usePrVerdict(card: Card, via: SendVia = direct) {
  const requestId = card.waiting?.requestId ?? null;
  const dKey = draftKey(card.key, prDraftId(requestId));
  const [{ chosen, text, push }, edit] = useDraft(dKey, { chosen: null as PrVerdict | null, text: "", push: true });
  const feedbackOf = (v: PrVerdict, note: string) => prFeedback(requestId, v, note);
  const feedback = chosen ? feedbackOf(chosen, text) : null;
  const sendWith = (v: PrVerdict, note: string) => sendFeedback(card, feedbackOf(v, note), push, dKey, via);
  return { requestId, chosen, text, push, edit, feedback, feedbackOf, canSend: !!feedback && canSend(feedback), send: () => (chosen ? sendWith(chosen, text) : Promise.resolve(false)), sendWith, clear: () => useStore.getState().clearDraft(dKey) };
}

/** A design round: picks, rejects and a comment. */
export function useRoundReaction(card: Card, round: DesignRound, via: SendVia = direct) {
  const dKey = draftKey(card.key, roundDraftId(round.round));
  const [{ picks, rejects, text, push }, edit] = useDraft(dKey, { picks: [] as string[], rejects: [] as string[], text: "", push: true });
  const toggle = (field: "picks" | "rejects", k: string) => {
    const list = field === "picks" ? picks : rejects;
    edit({ [field]: list.includes(k) ? list.filter((x) => x !== k) : [...list, k] });
  };
  const feedbackOf = (p: string[], r: string[], comment: string) => roundFeedback(round.round, p, r, comment);
  const feedback = feedbackOf(picks, rejects, text);
  const sendWith = (p: string[], r: string[], comment: string) => sendFeedback(card, feedbackOf(p, r, comment), push, dKey, via);
  return { picks, rejects, text, push, edit, toggle, feedback, feedbackOf, canSend: canSend(feedback), send: () => sendWith(picks, rejects, text), sendWith, clear: () => useStore.getState().clearDraft(dKey) };
}
