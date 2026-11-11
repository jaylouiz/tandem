// A decision in Focus: the question large, the options as tiles side by side. A click on a tile, or its digit, sends that option at
// once; the tile says beforehand which comment that writes. "Answer with a note" is the second path: with the note open the tiles only
// pick, the Send bar shows the whole comment and ⌘↵ sends it.
import { feedbackComment, optionKey, optionText } from "../../../core/answer.ts";
import type { Card } from "../../../core/types.ts";
import { useDecisionAnswer } from "../../feedback/answers.ts";
import { useRegisterPanel } from "../../feedback/panel.ts";
import { useFocusKeys } from "../../focus/keys.ts";
import { focusSend, useFocus } from "../../focus/session.ts";
import { keyOf } from "../../keys.ts";
import { Ext } from "../bits.tsx";
import { KeyLine, Meta, Note, SendBar, Tile, useCover } from "./parts.tsx";

const clip = (o: string) => (o.length > 60 ? `${o.slice(0, 59)}…` : o);

export function DecisionCover({ card }: { card: Card }) {
  const a = useDecisionAnswer(card, focusSend);
  const { sending, details } = useCover();
  const noteOpen = useFocus((s) => !!s.noting[card.key]);
  const setNoting = useFocus((s) => s.setNoting);
  const options = a.req?.options ?? [];
  // a request without options is answered in words: its note is always there. A draft with text (typed in the Card pane) opens it too.
  const noting = noteOpen || !!a.text || !options.length;
  const cancellable = noting && options.length > 0;

  const pick = (n: number) => {
    const opt = options[n - 1];
    if (!opt || sending) return;
    if (noting) return a.edit({ choice: a.choice === opt ? null : opt });
    a.edit({ choice: opt }); // kept if the send fails: the option stays picked and ⌘↵ sends it again
    void a.sendWith(opt, "");
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
      choices: options.map((o, i) => ({ n: i + 1, label: `${noting ? "Choose" : "Send"} ${clip(o)}`, on: a.choice === o })),
      canSend: a.canSend && !sending,
      push: a.push,
      setPush: (p) => a.edit({ push: p }),
    },
    !details,
  );
  useFocusKeys("cover", {
    "focus-note": noting ? undefined : { label: "Answer with a note", run: () => setNoting(card.key, true) },
    escape: cancellable ? { label: "Cancel the note", run: cancel } : undefined,
  });

  const req = a.req;
  if (!req) return null;
  const rec = req.recommendation;
  const recommended = (opt: string) => !!rec && optionKey(opt).toLowerCase() === rec.split(/[\s(]/)[0]!.toLowerCase();
  const confidence = /confidence\s+(\w+)/i.exec(rec ?? "")?.[1] ?? "";
  return (
    <>
      <div className="cover-scroll">
        <div className="cover-col" data-testid="cover-decision">
          <Meta card={card} kind="decision" />
          <h1 className="cover-q">{req.question}</h1>
          {options.length > 0 && (
            <div className="tiles" role="group" aria-label="Options">
              {options.map((o, i) => (
                <Tile
                  key={o}
                  n={i + 1}
                  head={optionKey(o)}
                  text={optionText(o)}
                  writes={noting ? undefined : feedbackComment(a.feedbackOf(o, "")!)}
                  picks={noting}
                  picked={a.choice === o}
                  recommended={recommended(o) ? confidence : null}
                  onClick={() => pick(i + 1)}
                />
              ))}
            </div>
          )}
          <div className="cover-under">
            <Note
              open={noting}
              value={a.text}
              onChange={(text) => a.edit({ text })}
              onOpen={() => setNoting(card.key, true)}
              onSend={() => void a.send()}
              addLabel="Answer with a note"
              placeholder={options.length ? "Your note. It is sent with the option you pick, or alone as your answer." : "Your answer"}
            />
            {req.preview && (
              <a className="cover-link" href={req.preview} target="_blank" rel="noreferrer">
                Open preview
                <Ext />
              </a>
            )}
          </div>
        </div>
      </div>
      <SendBar
        card={card}
        noting={noting}
        hint="A click on an option, or its digit, sends it at once. Each option shows the comment it writes."
        comment={a.canSend && a.feedback ? feedbackComment(a.feedback) : null}
        why={a.canSend ? null : options.length ? "Pick an option or write an answer" : "Write an answer"}
        push={a.push}
        setPush={(p) => a.edit({ push: p })}
        onSend={() => void a.send()}
        onCancel={cancellable ? cancel : undefined}
      />
      <KeyLine
        hints={
          noting
            ? [...(options.length ? [[options.length > 1 ? `1–${options.length}` : "1", "pick"] as [string, string]] : []), [keyOf("send-feedback"), "send"], ...(cancellable ? [[keyOf("escape"), "cancel the note"] as [string, string]] : [])]
            : [
                [options.length > 1 ? `1–${options.length}` : "1", "send"],
                [keyOf("focus-note"), "with a note"],
              ]
        }
      />
    </>
  );
}
