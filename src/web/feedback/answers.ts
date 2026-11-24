// What an answer is and how it is sent, per kind of Feedback: the draft (per Card + request, `useDraft`), whether it can be sent, the
// request it makes (`core/answer.ts`) and the send. The Card pane's panels (`components/Feedback.tsx`) and the covers of Focus
// (`components/focus/`) both stand on these, so there is one rule for what gets written. How an answer is given (pick then Send in
// the panels, a click that sends in Focus) is the caller's.
import { canSend, decisionFeedback, optionKey, prFeedback, questionsFeedback, roundFeedback, type Feedback } from "../../core/answer.ts";
import { answerSummary, askQuestions, effectivePicks, unanswered, type Ask, type Notes, type Picks } from "../../core/questions.ts";
import type { PrVerdict } from "../../core/contract.ts";
import { draftKey, prDraftId, roundDraftId } from "../../core/drafts.ts";
import type { Card, DesignRound } from "../../core/types.ts";
import { giveFeedback, useDraft, useStore } from "../store.ts";

/** What an answered Card looks like until the next snapshot. */
const DONE: Partial<Card> = { waiting: null, awaitingPickup: true };

/** Wraps a send: Focus holds the ask while the write runs and keeps the receipt (`focus/session.ts`). Default: just run it. */
export type SendVia = (card: Card, feedback: Feedback, run: () => Promise<boolean>) => Promise<boolean>;
export const direct: SendVia = (_card, _feedback, run) => run();

/** Send `f` through the one write path (`giveFeedback`: optimistic patch, rollback, the failure on the Card); the draft goes once it went through. */
function sendFeedback(card: Card, f: Feedback | null, push: boolean, dKey: string, via: SendVia): Promise<boolean> {
  if (!f || !canSend(f)) return Promise.resolve(false);
  const patch = f.action === "pr" && f.body.verdict === "hold" ? { ...DONE, onHold: true } : DONE;
  return via(card, f, async () => {
    const sent = await giveFeedback(card, f.action, { ...f.body, push }, patch, { cover: via !== direct });
    if (sent) useStore.getState().clearDraft(dKey);
    return sent;
  });
}

/** The draft of an answer to a request, whatever asks it: a pick (an option's key) and a note per question, the step on screen, Push. */
const ANSWER_DRAFT = { picks: {} as Picks, notes: {} as Notes, step: 0, push: true };

/**
 * A decision request with one question (or none): one option, a note, or both. The cover of Focus stands on this; the sheet's ask panel
 * (`useAskAnswer`) keeps the same draft, so what was picked or typed in one shows in the other.
 */
export function useDecisionAnswer(card: Card, via: SendVia = direct) {
  const req = card.requests.find((r) => r.id === card.waiting?.requestId);
  const dKey = draftKey(card.key, req?.id ?? "");
  const [draft, editDraft] = useDraft(dKey, ANSWER_DRAFT);
  // one question with a ★ option: the ★ counts as picked until it is taken back, as in the sheet's ask panel (`questionsAnswer`)
  const ask = askQuestions(card);
  const pick = ask && ask.questions.length === 1 ? effectivePicks(ask, draft.picks)[1] : draft.picks[1];
  const choice = req?.options.find((o) => optionKey(o) === pick) ?? null;
  /** the option the developer picked themselves (not the ★ that counts until then): a second pick of it takes it back */
  const own = req?.options.find((o) => optionKey(o) === draft.picks[1]) ?? null;
  const text = draft.notes[1] ?? "";
  const push = draft.push;
  const edit = (p: { choice?: string | null; text?: string; push?: boolean }) =>
    editDraft({ ...("choice" in p ? { picks: { 1: p.choice ? optionKey(p.choice) : "" } } : {}), ...("text" in p ? { notes: p.text ? { 1: p.text } : {} } : {}), ...(p.push === undefined ? {} : { push: p.push }) });
  /** the Feedback for this choice and note, sendable or not; null without a request */
  const feedbackOf = (c: string | null, note: string) => (req ? decisionFeedback(req.id, c, note) : null);
  const feedback = feedbackOf(choice, text);
  const sendWith = (c: string | null, note: string) => sendFeedback(card, feedbackOf(c, note), push, dKey, via);
  return { req, choice, own, text, push, edit, feedback, feedbackOf, canSend: !!feedback && canSend(feedback), send: () => sendWith(choice, text), sendWith, clear: () => useStore.getState().clearDraft(dKey) };
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

const clamp = (i: number, max: number) => Math.max(0, Math.min(max, Math.round(Number(i)) || 0));

/**
 * An ask with questions (#13): a pick per question (the recommendation where the developer picked nothing), a note per question, the step
 * on screen (the questions in order, then Review), and one comment for all of it. Nothing is written before `send`.
 */
export function useAskAnswer(card: Card, ask: Ask, via: SendVia = direct) {
  const dKey = draftKey(card.key, ask.id);
  const [{ picks, notes, step, push }, edit] = useDraft(dKey, ANSWER_DRAFT);
  const count = ask.questions.length;
  const multi = count > 1;
  /** the step on screen: a question's index, or `count` for Review (an ask with one question has no steps) */
  const at = multi ? clamp(step, count) : 0;
  const feedback = questionsFeedback(ask, picks, notes);
  const sendable = canSend(feedback);
  const go = (i: number) => multi && edit({ step: clamp(i, count) });
  /** `stay`: pick without moving on (the screenshot view, the Review) */
  const pick = (n: number, letter: string, stay = false) => {
    const i = ask.questions.findIndex((q) => q.n === n);
    edit({ picks: { ...picks, [n]: letter }, ...(multi && !stay ? { step: clamp(i + 1, count) } : {}) });
  };
  const sendWith = (p: Picks, n: Notes) => sendFeedback(card, questionsFeedback(ask, p, n), push, dKey, via);
  return {
    picks,
    notes,
    push,
    at,
    multi,
    /** the picks that count: the developer's own, else the recommendation */
    eff: effectivePicks(ask, picks),
    open: unanswered(ask, picks),
    summary: answerSummary(ask, picks, notes),
    feedback,
    canSend: sendable,
    go,
    pick,
    setNote: (n: number, text: string) => edit({ notes: { ...notes, [n]: text } }),
    setPush: (p: boolean) => edit({ push: p }),
    send: () => sendWith(picks, notes),
    sendWith,
    clear: () => useStore.getState().clearDraft(dKey),
  };
}

export type AskAnswer = ReturnType<typeof useAskAnswer>;
