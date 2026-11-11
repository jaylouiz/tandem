// A PR approval in Focus: a verdict over its evidence. The question, then what the agent reported (why the merge stopped, verification,
// review) as three fact columns and the link to the diff, then the three verdicts as tiles. Approve and Hold merge send on a click or
// their digit; Send back needs a note, so its tile opens the note instead.
import { feedbackComment } from "../../../core/answer.ts";
import type { PrVerdict } from "../../../core/contract.ts";
import { prEvidence, whyStopped, type EvidenceLine } from "../../../core/evidence.ts";
import type { Card } from "../../../core/types.ts";
import { VERDICTS, usePrVerdict } from "../../feedback/answers.ts";
import { useRegisterPanel } from "../../feedback/panel.ts";
import { useFocusKeys } from "../../focus/keys.ts";
import { focusSend, useFocus } from "../../focus/session.ts";
import { keyOf } from "../../keys.ts";
import { Ext } from "../bits.tsx";
import { KeyLine, Meta, Note, SendBar, Tile, useCover } from "./parts.tsx";

const PALETTE: Record<PrVerdict, string> = { approve: "Approve the PR", hold: "Hold the merge", "send-back": "Send the PR back" };

/** `open`: an unchecked item of the agent's list. It reads as not done (its own mark and words), never like passed evidence. */
function Facts({ title, lines, tone }: { title: string; lines: EvidenceLine[] | null; tone: "waiting" | "ok" }) {
  return (
    <div className="fact">
      <h2>{title}</h2>
      {lines ? (
        <ul>
          {lines.map((l, i) => (
            <li key={`${i}${l.text}`} data-tone={l.open ? "open" : tone}>
              <span>
                {l.open && <b>Not done: </b>}
                {l.text}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="faint">Nothing reported</p>
      )}
    </div>
  );
}

export function PrCover({ card }: { card: Card }) {
  const pr = card.pullRequest!;
  const a = usePrVerdict(card, focusSend);
  const { sending, details } = useCover();
  const noteOpen = useFocus((s) => !!s.noting[card.key]);
  const setNoting = useFocus((s) => s.setNoting);
  const noting = noteOpen || !!a.text || a.chosen === "send-back";

  const pick = (n: number) => {
    const v = VERDICTS[n - 1]?.[0];
    if (!v || sending) return;
    if (noting) return a.edit({ chosen: a.chosen === v ? null : v });
    a.edit({ chosen: v });
    if (v === "send-back") return setNoting(card.key, true); // it needs its note: the note opens, Send writes
    void a.sendWith(v, "");
  };
  const cancel = () => {
    setNoting(card.key, false);
    a.clear();
  };

  useRegisterPanel(
    card.key,
    {
      pick,
      send: () => void a.send(),
      choices: VERDICTS.map(([v], i) => ({ n: i + 1, label: noting ? PALETTE[v] : v === "send-back" ? "Send the PR back, with a note" : `Send: ${PALETTE[v]}`, on: a.chosen === v })),
      canSend: a.canSend && !sending,
      push: a.push,
      setPush: (p) => a.edit({ push: p }),
    },
    !details,
  );
  useFocusKeys("cover", {
    "focus-note": noting ? undefined : { label: "Send with a note", run: () => setNoting(card.key, true) },
    escape: noting ? { label: "Cancel the note", run: cancel } : undefined,
  });

  const req = card.requests.find((r) => r.id === card.waiting?.requestId);
  const question = req?.question ?? `PR #${pr.number} awaits approval`;
  const why = whyStopped(question);
  const evidence = prEvidence(pr.body);
  return (
    <>
      <div className="cover-scroll">
        <div className="cover-col" data-testid="cover-pr-approval">
          <Meta card={card} kind="pr-approval" />
          <h1 className="cover-q">{question}</h1>
          <div className="facts" data-testid="facts">
            {why && <Facts title="Why it stopped" lines={[{ text: why, open: false }]} tone="waiting" />}
            <Facts title="Verification" lines={evidence.verification} tone="ok" />
            <Facts title="Review" lines={evidence.review} tone="ok" />
            <a className="cover-link" href={`${pr.url}/files`} target="_blank" rel="noreferrer">
              PR #{pr.number}: diff on GitHub
              <Ext />
            </a>
          </div>
          <div className="tiles" role="group" aria-label="Verdict">
            {VERDICTS.map(([v, label, what], i) => (
              <Tile
                key={v}
                n={i + 1}
                head={label}
                text={what}
                writes={
                  noting ? undefined : v === "send-back" ? (
                    <>
                      {feedbackComment(a.feedbackOf(v, ""))}. <i>your note</i>
                    </>
                  ) : (
                    feedbackComment(a.feedbackOf(v, ""))
                  )
                }
                picks={noting}
                picked={a.chosen === v}
                onClick={() => pick(i + 1)}
              />
            ))}
          </div>
          <div className="cover-under">
            <Note open={noting} value={a.text} onChange={(text) => a.edit({ text })} onOpen={() => setNoting(card.key, true)} onSend={() => void a.send()} addLabel="Send with a note" placeholder="Your note. Send back needs one." />
          </div>
        </div>
      </div>
      <SendBar
        card={card}
        noting={noting}
        hint="A click on Approve or Hold merge, or its digit, sends it at once. Each verdict shows the comment it writes."
        comment={a.canSend && a.feedback ? feedbackComment(a.feedback) : null}
        why={a.canSend ? null : !a.chosen ? "Pick Approve, Hold merge or Send back first" : "Send back needs a note"}
        push={a.push}
        setPush={(p) => a.edit({ push: p })}
        onSend={() => void a.send()}
        onCancel={cancel}
      />
      <KeyLine
        hints={
          noting
            ? [
                ["1–3", "pick"],
                [keyOf("send-feedback"), "send"],
                [keyOf("escape"), "cancel the note"],
              ]
            : [
                ["1", "approve"],
                ["2", "hold"],
                ["3", "send back"],
                [keyOf("focus-note"), "with a note"],
              ]
        }
      />
    </>
  );
}
