// proto #17 (never merged). Answering at the question level (#13): one group per question, one pick each, the recommendation
// preselected, one Send. Used by the Card sheet (AskPanel) and by Focus (QuestionsCover). Question 3 of the round picks the shape:
// B every question on the page, C one question at a time with a review at the end.
import DOMPurify from "dompurify";
import { marked } from "marked";
import { useRef, useState, type KeyboardEvent } from "react";
import { decisionFeedback, roundFeedback, type Feedback } from "../../core/answer.ts";
import { draftKey, roundDraftId } from "../../core/drafts.ts";
import type { Card } from "../../core/types.ts";
import { ShotImg } from "../components/Gallery.tsx";
import { Btn, Ext, ago, shortRepo } from "../components/bits.tsx";
import { KeyLine, Meta, useCover } from "../components/focus/parts.tsx";
import { direct, sendFeedback, type SendVia } from "../feedback/answers.ts";
import { useRegisterPanel } from "../feedback/panel.ts";
import { focusSend } from "../focus/session.ts";
import { keyOf } from "../keys.ts";
import { useSigned } from "../signed.ts";
import { useDraft, useStore } from "../store.ts";
import { Dialog } from "../ui/Dialog.tsx";
import { answerText, commentOf, effective, recOf, summaryOf, type Ask, type Notes, type Picks, type Question } from "./questions.ts";
import { useVariant } from "./variant.ts";

export const Star = () => (
  <svg className="star" width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
    <path d="M6 .8l1.5 3.3 3.6.4-2.7 2.4.8 3.5L6 8.6 2.8 10.4l.8-3.5L.9 4.5l3.6-.4z" />
  </svg>
);

const Check = () => (
  <svg className="qcheck" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 8.5 6.5 12 13 4.5" />
  </svg>
);

/** Inline Markdown of an agent's line (`**H1 Sunlit Outline**`, `code`), never a block. */
export function Inline({ text }: { text: string }) {
  return <span className="inline-md" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parseInline(text, { async: false, gfm: true }) as string) }} />;
}

/** The answer to one ask: picks (the recommendation where nothing was picked), a note per question, the comment it writes, the send. */
export function useAnswer(card: Card, ask: Ask, via: SendVia = direct) {
  const v = useVariant();
  // the draft lives under the id of the panel it replaces, so a snapshot does not prune it (`core/drafts.ts`); its fields are its own
  const round = card.rounds.at(-1);
  const dKey = draftKey(card.key, card.waiting?.kind === "design-round" && round ? roundDraftId(round.round) : ask.id);
  const [{ qpicks: picks, qnotes: notes, push, at }, editDraft] = useDraft(dKey, { qpicks: {} as Picks, qnotes: {} as Notes, push: true, at: ask.questions[0]?.n ?? 1 });
  const edit = ({ picks: p, notes: n, ...rest }: { picks?: Picks; notes?: Notes; push?: boolean; at?: number }) => editDraft({ ...rest, ...(p ? { qpicks: p } : {}), ...(n ? { qnotes: n } : {}) });
  const eff = effective(ask, picks);
  const comment = commentOf(ask, picks, notes, v.prefix);
  const order = ask.questions.map((q) => q.n);
  const pick = (n: number, letter: string) => edit({ picks: { ...picks, [n]: letter }, at: order[Math.min(order.indexOf(n) + 1, order.length - 1)] ?? n });
  const send = () => {
    if (!comment) return Promise.resolve(false);
    const said = ask.questions.filter((q) => notes[q.n]?.trim()).map((q) => `${q.n} ${q.label}: ${notes[q.n]!.trim()}`).join("\n");
    // question 4: A writes the round reaction (`R1:` / `- pick:`), B and C the decision's short form (C is shown, the demo server writes B's text)
    const f: Feedback = ask.round !== null && v.prefix === "A" ? roundFeedback(ask.round, ask.questions.map((q) => `${q.n}${eff[q.n]}`), [], said) : decisionFeedback(ask.id, null, answerText(ask, picks, notes));
    return sendFeedback(card, f, push, dKey, via);
  };
  return { picks, eff, notes, push, at, edit, pick, comment, canSend: !!comment, send, summary: summaryOf(ask, picks, notes), setNote: (n: number, text: string) => edit({ notes: { ...notes, [n]: text } }) };
}
type Answer = ReturnType<typeof useAnswer>;

/** Digits pick an option of the question that is "at", then the next question is at; ⌘↵ sends. */
function useAskKeys(card: Card, ask: Ask, a: Answer, on: boolean, blocked = false) {
  const q = ask.questions.find((x) => x.n === a.at) ?? ask.questions[0];
  useRegisterPanel(
    card.key,
    {
      pick: (n) => {
        const o = q?.options[n - 1];
        if (q && o && !blocked) a.pick(q.n, o.letter);
      },
      send: () => void (blocked ? undefined : a.send()),
      choices: (q?.options ?? []).map((o, i) => ({ n: i + 1, label: `${q!.label ? `${q!.n} ${q!.label}: ` : ""}${o.letter} ${o.name}`.slice(0, 70), on: a.eff[q!.n] === o.letter })),
      canSend: a.canSend && !blocked,
      push: a.push,
      setPush: (p) => a.edit({ push: p }),
    },
    on,
  );
}

function Group({ card, ask, q, a, active, keys, onShot, big }: { card: Card; ask: Ask; q: Question; a: Answer; active: boolean; keys: boolean; onShot?: (n: number) => void; big?: boolean }) {
  const signed = useSigned(card);
  const round = card.rounds.at(-1);
  const [noting, setNoting] = useState(false);
  const note = a.notes[q.n] ?? "";
  const shot = round && q.shots[0] ? signed.shots(round.commentId, q.shots)[0] : undefined;
  const rec = recOf(q);
  // keyword options (a request without a round) sit side by side
  const compact = !ask.legacy && q.options.every((o) => !o.short && o.name.length <= 26);
  return (
    <section className="qgroup" data-shot={shot ? true : undefined} data-active={active || undefined} data-big={big || undefined} data-testid={`qgroup-${q.n}`} onFocus={() => a.at !== q.n && a.edit({ at: q.n })}>
      {q.label && (
        <header className="qhead">
          <span className="qnum">{q.n}</span>
          <b>{q.label}</b>
          {q.about && <span className="muted">{q.about}</span>}
          <span className="spacer" />
          {!noting && !note && (
            <button className="qnote-add" onClick={() => setNoting(true)}>
              Add a note
            </button>
          )}
        </header>
      )}
      <div className="qmain">
        <div className="qopts" role="radiogroup" aria-label={q.label || ask.title} data-compact={compact || undefined}>
          {q.options.map((o, i) => (
            <button key={o.letter} className="qopt" role="radio" aria-checked={a.eff[q.n] === o.letter} data-legacy={ask.legacy || undefined} onClick={() => a.pick(q.n, o.letter)}>
              {keys && active ? <kbd>{i + 1}</kbd> : <span className="qopt-nokey" aria-hidden />}
              <b className="qopt-letter">{o.letter}</b>
              <span className="qopt-body">
                {o.name && (
                  <span className="qopt-name">
                    <Inline text={o.name} />
                  </span>
                )}
                {o.today && <span className="qtoday">today</span>}
                {o.short && <span className="qopt-short">{o.short}</span>}
              </span>
              {o.rec && (
                <span className="qopt-rec" title="The agent recommends this">
                  <Star /> {compact ? <span className="sr-only">Recommended</span> : "Recommended"}
                </span>
              )}
            </button>
          ))}
        </div>
        {q.why && (
          <p className="qwhy">
            <Star />
            <span>
              <b>{ask.legacy ? (rec ? "Why:" : "The agent says:") : `Why ${rec}:`}</b> <Inline text={q.why} />
            </span>
          </p>
        )}
        {(noting || note) && (
          <input className="input qnote" autoFocus={noting} aria-label={`Note on ${q.label || "your answer"}`} placeholder={ask.legacy ? "Add a note, or answer in your own words" : `Note on ${q.label}, e.g. "but calmer"`} value={note} onChange={(e) => a.setNote(q.n, e.target.value)} onKeyDown={(e) => submitKeys(e, () => void a.send())} />
        )}
        {!q.label && !noting && !note && (
          <button className="qnote-add" onClick={() => setNoting(true)}>
            Add a note
          </button>
        )}
      </div>
      {shot && round && (
        <button className="qshot" onClick={() => (signed.ensure(round.commentId), onShot?.(q.n))} aria-label={`Open the screenshot of ${q.n}. ${q.label}`}>
          <ShotImg shot={shot} commentUrl={round.url} onRetry={() => signed.retry(round.commentId)} loading="lazy" />
        </button>
      )}
    </section>
  );
}

const submitKeys = (e: KeyboardEvent, go: () => void) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    go();
  }
};

/** C: one question on screen, a pick moves on, the last step is the review. */
function Steps({ card, ask, a, onShot, big }: { card: Card; ask: Ask; a: Answer; onShot: (n: number) => void; big?: boolean }) {
  const [review, setReview] = useState(false);
  const idx = Math.max(0, ask.questions.findIndex((q) => q.n === a.at));
  const q = ask.questions[idx]!;
  const wrapped: Answer = {
    ...a,
    pick: (n, letter) => {
      a.pick(n, letter);
      if (idx === ask.questions.length - 1) setReview(true);
    },
  };
  const go = (n: number) => {
    setReview(false);
    a.edit({ at: n });
  };
  return (
    <div className="qsteps" data-big={big || undefined}>
      <div className="qsteps-nav" role="tablist" aria-label="Questions">
        {ask.questions.map((x) => (
          <button key={x.n} role="tab" aria-selected={!review && x.n === q.n} onClick={() => go(x.n)}>
            <span className="qnum">{x.n}</span>
            {x.label}
            <span className="qsteps-pick">{a.eff[x.n]}</span>
          </button>
        ))}
        <button role="tab" aria-selected={review} onClick={() => setReview(true)}>
          Review
        </button>
      </div>
      {review ? (
        <ul className="qreview">
          {ask.questions.map((x) => {
            const o = x.options.find((y) => y.letter === a.eff[x.n]);
            return (
              <li key={x.n}>
                <span className="qnum">{x.n}</span>
                <b>{x.label}</b>
                <span className="qreview-pick">
                  <b>{o?.letter}</b> {o?.name}
                  {o?.rec && <Star />}
                </span>
                {a.notes[x.n]?.trim() && <span className="muted">“{a.notes[x.n]!.trim()}”</span>}
                <button className="btn ghost" onClick={() => go(x.n)}>
                  Change
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <Group card={card} ask={ask} q={q} a={wrapped} active keys onShot={onShot} big={big} />
      )}
    </div>
  );
}

/** The screenshot of a question, full screen, with its options to pick from (#5: the key legend in groups, pick first). */
function QuestionGallery({ card, ask, a, n, onN, onClose }: { card: Card; ask: Ask; a: Answer; n: number; onN: (n: number) => void; onClose: () => void }) {
  const signed = useSigned(card);
  const round = card.rounds.at(-1)!;
  const root = useRef<HTMLDivElement>(null);
  const withShot = ask.questions.filter((q) => q.shots.length);
  const idx = Math.max(0, withShot.findIndex((q) => q.n === n));
  const q = withShot[idx]!;
  const shot = signed.shots(round.commentId, q.shots)[0]!;
  const step = (d: number) => onN(withShot[Math.min(withShot.length - 1, Math.max(0, idx + d))]!.n);
  const onKey = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === "Enter") {
      if (!a.canSend) return;
      void a.send();
      onClose();
    } else if (mod || e.altKey) return;
    else if (e.key === "ArrowRight" || e.key === "l" || e.key === "]") step(1);
    else if (e.key === "ArrowLeft" || e.key === "h" || e.key === "[") step(-1);
    else if (/^[1-9]$/.test(e.key) && q.options[Number(e.key) - 1]) a.edit({ picks: { ...a.picks, [q.n]: q.options[Number(e.key) - 1]!.letter } });
    else return;
    e.preventDefault();
  };
  return (
    <Dialog open onClose={onClose} label={`Screenshots R${ask.round}`} className="gallery" backdrop={false} testId="gallery" popupRef={root} initialFocus={root} onKeyDown={onKey}>
      <div className="gallery-bar">
        <span className="gallery-context">R{ask.round}</span>
        <strong>
          {q.n}. {q.label}
        </strong>
        <span style={{ opacity: 0.7 }}>{q.about}</span>
        <span style={{ opacity: 0.6 }}>
          {idx + 1} / {withShot.length}
        </span>
        <span style={{ flex: 1 }} />
        <Btn className="btn" onClick={() => step(-1)} why={idx === 0 ? "This is the first question" : null} aria-label="Previous question">
          ←
        </Btn>
        <Btn className="btn" onClick={() => step(1)} why={idx === withShot.length - 1 ? "This is the last question" : null} aria-label="Next question">
          →
        </Btn>
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="gallery-stage" onClick={onClose}>
        <span onClick={(e) => e.stopPropagation()} style={{ display: "contents" }}>
          <ShotImg key={shot.alt} shot={shot} commentUrl={round.url} onRetry={() => signed.retry(round.commentId)} />
        </span>
      </div>
      <div className="gallery-picks" role="radiogroup" aria-label={`${q.n}. ${q.label}`}>
        {q.options.map((o, i) => (
          <button key={o.letter} className="btn gallery-pick" role="radio" aria-checked={a.eff[q.n] === o.letter} onClick={() => a.edit({ picks: { ...a.picks, [q.n]: o.letter } })}>
            <kbd>{i + 1}</kbd>
            <b>{o.letter}</b> {o.name}
            {o.rec && <Star />}
          </button>
        ))}
      </div>
      <div className="gallery-legend" data-testid="gallery-hint">
        <span className="legend-group">
          <b>Pick</b>
          <span>
            <kbd>1</kbd>–<kbd>{q.options.length}</kbd> an option of this question
          </span>
          <span>
            <kbd>{keyOf("send-feedback")}</kbd> send the answer
          </span>
        </span>
        <span className="legend-group">
          <b>Move</b>
          <span>
            <kbd>←</kbd>
            <kbd>→</kbd> question
          </span>
        </span>
        <span className="legend-group">
          <span>
            <kbd>esc</kbd> close
          </span>
        </span>
      </div>
    </Dialog>
  );
}

function Writes({ card, a }: { card: Card; a: Answer }) {
  return (
    <div className="qwrites">
      <span className="qwrites-label">
        Writes on {shortRepo(card.repo)}#{card.number}
      </span>
      <code data-testid="writes">{a.comment || "nothing yet"}</code>
    </div>
  );
}

/** The ask in the Card sheet: the question as the heading, one quiet line of facts and links, the questions, then what is written and Send. */
export function AskPanel({ card, ask }: { card: Card; ask: Ask }) {
  const v = useVariant();
  const a = useAnswer(card, ask);
  const open = useStore((s) => s.tab === "now") || v.sheet !== "A";
  const [shotOf, setShotOf] = useState<number | null>(null);
  useAskKeys(card, ask, a, open && shotOf === null);
  const stepped = v.answer === "C" && ask.questions.length > 1;
  return (
    <div className="section waiting askp" data-testid="panel-questions">
      <div className="panel-head">
        <div className="section-title">
          <Inline text={ask.title} />
        </div>
        <div className="panel-meta">
          <span className="did">{ask.id}</span>
          <span className="faint">waiting {ago(ask.since)}</span>
          {!ask.legacy && ask.questions.length > 1 && <span className="faint qlegend">
              {ask.questions.length} questions · <Star /> recommended, picked until you change it
            </span>}
          <span className="spacer" />
          {ask.preview && (
            <a href={ask.preview} target="_blank" rel="noreferrer">
              {ask.round !== null ? "Open prototype" : "Open preview"}
              <Ext />
            </a>
          )}
        </div>
      </div>
      {stepped ? (
        <Steps card={card} ask={ask} a={a} onShot={setShotOf} />
      ) : (
        <div className="qgroups">
          {ask.questions.map((q) => (
            <Group key={q.n} card={card} ask={ask} q={q} a={a} active={ask.questions.length === 1 || a.at === q.n} keys onShot={setShotOf} />
          ))}
        </div>
      )}
      <div className="qsend">
        <div className="qsend-what">
          {a.summary && <span className="qsummary">{a.summary}</span>}
          <Writes card={card} a={a} />
        </div>
        <label className="toggle" title="Tell the running coordinator right away">
          <input type="checkbox" checked={a.push} onChange={(e) => a.edit({ push: e.target.checked })} data-testid="push-toggle" /> Push
        </label>
        <Btn className="btn primary" why={a.canSend ? null : "Pick an option or write an answer"} onClick={() => void a.send()}>
          Send answer <kbd aria-hidden>{keyOf("send-feedback")}</kbd>
        </Btn>
      </div>
      {shotOf !== null && <QuestionGallery card={card} ask={ask} a={a} n={shotOf} onN={setShotOf} onClose={() => setShotOf(null)} />}
    </div>
  );
}

/** The same ask as a cover of Focus. Several questions never send on one click: the answer is one comment, sent once (⌘↵). */
export function QuestionsCover({ card, ask }: { card: Card; ask: Ask }) {
  const v = useVariant();
  const a = useAnswer(card, ask, focusSend);
  const { sending, failure, details } = useCover();
  const [shotOf, setShotOf] = useState<number | null>(null);
  useAskKeys(card, ask, a, !details && shotOf === null, sending);
  const stepped = v.answer === "C";
  const most = Math.max(...ask.questions.map((q) => q.options.length));
  return (
    <>
      <div className="cover-scroll">
        <div className="cover-col qcover" data-testid="cover-questions">
          <Meta card={card} kind={ask.round !== null ? "design-round" : "decision"} />
          <div className="cover-bar">
            <h1 className="cover-q small">{ask.title}</h1>
            {ask.preview && (
              <a className="cover-link" href={ask.preview} target="_blank" rel="noreferrer">
                {ask.round !== null ? "Open prototype" : "Open preview"}
                <Ext />
              </a>
            )}
          </div>
          {stepped ? (
            <Steps card={card} ask={ask} a={a} onShot={setShotOf} big />
          ) : (
            <div className="qgrid" data-count={ask.questions.length}>
              {ask.questions.map((q) => (
                <Group key={q.n} card={card} ask={ask} q={q} a={a} active={a.at === q.n} keys onShot={setShotOf} />
              ))}
            </div>
          )}
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
              <div className="sendbar-failed" role="alert">
                <b>Not sent.</b> {failure}
              </div>
            )}
            <div className="sendbar-written">
              <span className="sendbar-label">{a.summary}. Writes on {shortRepo(card.repo)}#{card.number}</span>
              <code data-testid="writes">{a.comment}</code>
            </div>
          </>
        )}
        <span className="spacer" />
        <label className="toggle" title="Tell the running coordinator right away">
          <input type="checkbox" checked={a.push} onChange={(e) => a.edit({ push: e.target.checked })} /> Push
        </label>
        {!sending && (
          <Btn className="btn primary big" data-testid="send" why={a.canSend ? null : "Pick an option for every question"} onClick={() => void a.send()}>
            {failure ? "Send again" : "Send answer"} <kbd>{keyOf("send-feedback")}</kbd>
          </Btn>
        )}
      </div>
      <KeyLine
        hints={[
          [most > 1 ? `1–${most}` : "1", "pick, then the next question"],
          [keyOf("send-feedback"), "send the answer"],
        ]}
      />
      {shotOf !== null && <QuestionGallery card={card} ask={ask} a={a} n={shotOf} onN={setShotOf} onClose={() => setShotOf(null)} />}
    </>
  );
}
