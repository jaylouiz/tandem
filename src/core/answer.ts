// What a piece of Feedback is before it is sent: the request Tandem makes and the comment that request writes. One place builds
// both, so the comment an option shows (Focus) is the comment the server writes for it (`app.ts` calls the same builders with the
// same body; `app.test.ts` posts every body below and compares). Pure; the wire shapes and the comment text are unchanged.
import { answerComment, prVerdictComment, roundReactionComment, type PrVerdict } from "./contract.ts";
import { changedFrom, effectivePicks, optionKey, recommendedOf, unanswered, type Ask, type Notes, type Picks } from "./questions.ts";
import type { Question } from "./types.ts";

export { optionKey, optionText } from "./questions.ts";

/** A decision's answer text: the chosen option's key, then the note. Either may be missing; "" means there is nothing to send. */
export function decisionAnswer(choice: string | null, note: string): string {
  return [choice ? optionKey(choice) : "", note.trim()].filter(Boolean).join(". ");
}

const spelled = (q: Question, letter: string) => {
  const name = q.options.find((o) => o.letter === letter)?.name;
  return `${q.n} ${q.label}: ${letter}${name ? ` (${name})` : ""}`;
};

/**
 * The answer to an ask with questions, without its prefix, in the forms of agent-workflow docs/contract.md "Replies a client writes" (read by `bin/decision_format.py read`):
 *   `ok`                                    every recommendation
 *   `ok. 1A 3B`                             the recommendations, except these
 *   `1B 2A`                                 when a question has no recommendation
 *   `1 Shell: C (top stepper) but calmer`   one line per question, as soon as a question carries a note
 * One question: the option's key, then the note (`B`, `B. wait for the review`), as `decisionAnswer`.
 * "" while a question has no pick (and, with one question, no note either): nothing to send.
 */
export function questionsAnswer(ask: Ask, picks: Picks, notes: Notes): string {
  const eff = effectivePicks(ask, picks);
  const note = (q: Question) => notes[q.n]?.trim() ?? "";
  if (ask.questions.length === 1) return [eff[ask.questions[0]!.n] ?? "", note(ask.questions[0]!)].filter(Boolean).join(". ");
  if (unanswered(ask, picks).length) return "";
  if (ask.questions.some(note)) return ask.questions.map((q) => `${spelled(q, eff[q.n]!)}${note(q) ? ` ${note(q)}` : ""}`).join("\n");
  const short = (qs: Question[]) => qs.map((q) => `${q.n}${eff[q.n]}`).join(" ");
  if (ask.questions.some((q) => !recommendedOf(q))) return short(ask.questions);
  const diff = changedFrom(ask, picks);
  return diff.length ? `ok. ${short(diff)}` : "ok";
}

/** The Feedback for an ask with questions: an answer to its request (a design round with an open request is answered as that request, #1). */
export const questionsFeedback = (ask: Ask, picks: Picks, notes: Notes): Feedback => ({ action: "answer", body: { requestId: ask.id, answer: questionsAnswer(ask, picks, notes) } });

/** One piece of Feedback as it goes to the server: the route under the Card (`/answer`, `/pr`, `/round`) and its body, without Push. */
export type Feedback =
  | { action: "answer"; body: { requestId: string; answer: string } }
  | { action: "pr"; body: { verdict: PrVerdict; text: string; requestId: string | null } }
  | { action: "round"; body: { round: number; picks: string[]; rejects: string[]; comment: string } };

export const decisionFeedback = (requestId: string, choice: string | null, note: string): Feedback => ({ action: "answer", body: { requestId, answer: decisionAnswer(choice, note) } });

export const prFeedback = (requestId: string | null, verdict: PrVerdict, note: string): Feedback => ({ action: "pr", body: { verdict, text: note, requestId } });

export const roundFeedback = (round: number, picks: string[], rejects: string[], comment: string): Feedback => ({ action: "round", body: { round, picks, rejects, comment } });

/** Whether this Feedback says anything: an empty answer, a Send back without its note or a reaction without a pick, a reject or a comment is not sent. */
export function canSend(f: Feedback): boolean {
  switch (f.action) {
    case "answer":
      return !!f.body.answer;
    case "pr":
      return f.body.verdict !== "send-back" || !!f.body.text.trim();
    case "round":
      return !!(f.body.picks.length || f.body.rejects.length || f.body.comment.trim());
  }
}

/** The comment the server writes on the issue for this Feedback, word for word. */
export function feedbackComment(f: Feedback): string {
  switch (f.action) {
    case "answer":
      return answerComment(f.body.requestId, f.body.answer);
    case "pr":
      return prVerdictComment(f.body.requestId, f.body.verdict, f.body.text);
    case "round":
      return roundReactionComment(f.body);
  }
}
