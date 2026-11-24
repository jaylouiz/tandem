// An ask with questions in Focus (#13): the same steps as in the Card sheet, larger. Several questions never send on a click or a digit:
// the answer is one comment, sent with ⌘↵ or Send answer from any step (every recommendation is picked from the start, so `ok` is one
// key). A round that asks one question sends on its pick, like every one-click cover.
import { useState } from "react";
import type { Ask } from "../../../core/questions.ts";
import type { Card, Question } from "../../../core/types.ts";
import { useAskAnswer } from "../../feedback/answers.ts";
import { useFocusKeys } from "../../focus/keys.ts";
import { focusSend } from "../../focus/session.ts";
import { keyOf } from "../../keys.ts";
import type { Signed } from "../../signed.ts";
import { AskLink, QuestionGallery, QuestionView, Review, StepPanel, Steps, sendBlocked, useAskKeys, useAskShots, useStepFocus, writtenComment } from "../Questions.tsx";
import { Btn, Inline, shortRepo } from "../bits.tsx";
import { KeyLine, Meta, useCover } from "./parts.tsx";

export function QuestionsCover({ card, ask, signed }: { card: Card; ask: Ask; signed: Signed }) {
  const a = useAskAnswer(card, ask, focusSend);
  const { sending, failure, details } = useCover();
  const g = useAskShots(card, ask, signed);
  const q = ask.questions[a.at];
  // one question and no note on it: the pick is the answer, sent at once (kept if the send fails, so ⌘↵ sends it again)
  const [noted, setNoted] = useState(false);
  const sendsOnPick = !a.multi && !noted && !a.notes[ask.questions[0]!.n]?.trim();
  const focus = useStepFocus(a.at);
  const onPick = (x: Question, letter: string) => {
    if (sending) return;
    focus.mark();
    a.pick(x.n, letter);
    if (sendsOnPick) void a.sendWith({ ...a.picks, [x.n]: letter }, a.notes);
  };
  useAskKeys(card, ask, a, !details && g.index === null, { blocked: sending, onPick });
  useFocusKeys(
    "cover",
    { "focus-step": a.multi ? { label: { "]": "Next question", "[": "Previous question" }, run: (e) => void a.go(a.at + (e.key === "]" ? 1 : -1)) } : undefined },
    g.index === null,
  );
  const why = sendBlocked(ask, a);
  const comment = writtenComment(a);
  // the digits of the question on screen (on Review they pick nothing)
  const most = Math.min(9, q?.options.length ?? 0);
  const digits = most > 1 ? `1–${most}` : "1";
  return (
    <>
      <div className="cover-scroll">
        <div className="cover-col qcover" data-testid="cover-questions" ref={focus.root}>
          <Meta card={card} kind={ask.round !== null ? "design-round" : "decision"} />
          <div className="qcover-head">
            <h1 className="cover-q">
              <Inline text={ask.title} />
            </h1>
            <AskLink ask={ask} className="cover-link" />
          </div>
          {a.multi && <Steps ask={ask} a={a} />}
          <div className="qcover-step" onFocusCapture={(e) => e.target instanceof HTMLInputElement && setNoted(true)}>
            <StepPanel ask={ask} a={a} className="qcover-panel">
              {q ? <QuestionView key={q.n} ask={ask} q={q} a={a} keys onPick={onPick} shots={g.forQuestion} big /> : <Review ask={ask} a={a} big />}
            </StepPanel>
          </div>
        </div>
      </div>
      <div className="sendbar" data-testid="sendbar" data-state={sending ? "sending" : failure ? "failed" : "note"}>
        {sending ? (
          <div className="sendbar-hint" role="status">
            Sending…
          </div>
        ) : (
          <>
            {failure && (
              <div className="sendbar-failed" role="alert" data-testid="not-sent">
                <b>Not sent.</b> {failure}
              </div>
            )}
            <div className="sendbar-written">
              <span className="sendbar-label">
                {a.summary && (
                  <b className="sendbar-summary" data-testid="summary">
                    {a.summary}
                  </b>
                )}
                Writes on {shortRepo(card.repo)}#{card.number}
              </span>
              {comment ? <code data-testid="writes">{comment}</code> : <span className="faint">{why}</span>}
            </div>
          </>
        )}
        <span className="spacer" />
        <label className="toggle" title="Tell the running coordinator right away">
          <input type="checkbox" checked={a.push} onChange={(e) => a.setPush(e.target.checked)} data-testid="push-toggle" /> Push
        </label>
        {!sending && (
          <Btn className="btn primary big" data-testid="send" why={why} onClick={() => void a.send()}>
            {failure ? "Send again" : "Send answer"} <kbd>{keyOf("send-feedback")}</kbd>
          </Btn>
        )}
      </div>
      <KeyLine
        hints={
          a.multi
            ? [
                ...(q ? [[digits, "pick, then the next question"] as [string, string]] : []),
                ["[ ]", "question"],
                [keyOf("send-feedback"), "send the answer"],
              ]
            : [
                [digits, sendsOnPick ? "send" : "pick"],
                [keyOf("send-feedback"), "send the answer"],
              ]
        }
      />
      {g.index !== null && g.round && <QuestionGallery ask={ask} a={a} shots={g.shots} index={g.index} onIndex={g.open} onClose={g.close} commentUrl={g.round.url} onRetry={() => signed.retry(g.round!.commentId)} />}
    </>
  );
}
