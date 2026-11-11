// What a piece of Feedback is before it is sent: the request Tandem makes and the comment that request writes. One place builds
// both, so the comment an option shows (Focus) is the comment the server writes for it (`app.ts` calls the same builders with the
// same body; `app.test.ts` posts every body below and compares). Pure; the wire shapes and the comment text are unchanged.
import { answerComment, prVerdictComment, roundReactionComment, type PrVerdict } from "./contract.ts";

/** An option as the agent wrote it (`B: field-level merge`): its key, the part an answer names. */
export const optionKey = (option: string) => option.split(":")[0]!.trim();

/** The rest of an option after its key, or "" when the option is its key alone. */
export const optionText = (option: string) => (option.includes(":") ? option.slice(option.indexOf(":") + 1).trim() : "");

/** A decision's answer text: the chosen option's key, then the note. Either may be missing; "" means there is nothing to send. */
export function decisionAnswer(choice: string | null, note: string): string {
  return [choice ? optionKey(choice) : "", note.trim()].filter(Boolean).join(". ");
}

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
