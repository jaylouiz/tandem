// Answering at the question level (#13): an ask's questions one at a time, a pick per question (the recommendation is picked from the
// start), a Review step, and one comment for all of it. The parts here serve the Card sheet (`AskPanel`) and the cover of Focus
// (`focus/QuestionsCover.tsx`): the steps, the question on screen, the Review, the row that says what will be written, and the screenshot
// view of a question. What an answer is and how it is sent: `feedback/answers.ts` (`useAskAnswer`) and `core/answer.ts`.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { feedbackComment } from "../../core/answer.ts";
import { recommendedOf, type Ask } from "../../core/questions.ts";
import type { Card, Question, Screenshot } from "../../core/types.ts";
import { useAskAnswer, type AskAnswer } from "../feedback/answers.ts";
import { useRegisterPanel } from "../feedback/panel.ts";
import { keyOf } from "../keys.ts";
import type { Signed } from "../signed.ts";
import { Dialog } from "../ui/Dialog.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import { KeyLegend, ShotImg } from "./Gallery.tsx";
import { Btn, Ext, Inline, Star, ago, shortRepo } from "./bits.tsx";

const submitKeys = (e: KeyboardEvent, go: () => void) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    go();
  }
};

/** Why Send does nothing right now, in the sheet and in Focus alike. */
export const sendBlocked = (ask: Ask, a: AskAnswer): string | null => (a.canSend ? null : a.multi ? "Pick an option for every question" : "Pick an option or write an answer");

/** The comment Send writes now, word for word; null while there is nothing to send. */
export const writtenComment = (a: AskAnswer): string | null => (a.canSend ? feedbackComment(a.feedback) : null);

/** The question whose options the digits pick: the one on screen, none on Review. */
const current = (ask: Ask, a: AskAnswer): Question | undefined => ask.questions[a.at];

/**
 * The ask's keys for the window handler and the palette: a digit picks an option of the question on screen (and moves on), `[` `]` move
 * between the steps, ⌘↵ sends. `sendsOnPick`: Focus with one question, where the pick is the answer.
 */
export function useAskKeys(card: Card, ask: Ask, a: AskAnswer, on: boolean, opts: { blocked?: boolean; onPick?: (q: Question, letter: string) => void } = {}) {
  const q = current(ask, a);
  useRegisterPanel(
    card.key,
    {
      pick: (n) => {
        const o = q?.options[n - 1];
        if (!q || !o || opts.blocked) return;
        if (opts.onPick) opts.onPick(q, o.letter);
        else a.pick(q.n, o.letter);
      },
      send: () => void (opts.blocked ? undefined : a.send()),
      choices: (q?.options ?? []).map((o, i) => ({ n: i + 1, label: `${q!.label ? `${q!.n} ${q!.label}: ` : "Choose "}${o.name ? `${o.letter} ${o.name}` : o.letter}`.slice(0, 70), on: a.eff[q!.n] === o.letter })),
      canSend: a.canSend && !opts.blocked,
      push: a.push,
      setPush: a.setPush,
      step: a.multi ? (dir) => a.go(a.at + dir) : undefined,
    },
    on,
  );
}

/** The steps of an ask with several questions: one per question with its number, label and picked letter, then Review. A tab list: one step is on screen. */
export const stepId = (ask: Ask, i: number) => `ask-${ask.id}-step-${i}`;
export const STEP_PANEL = (ask: Ask) => `ask-${ask.id}-panel`;

export function Steps({ ask, a }: { ask: Ask; a: AskAnswer }) {
  const review = ask.questions.length;
  const onKey = (e: KeyboardEvent) => {
    // a tab list's own arrows (the window's `[` `]` do the same from anywhere)
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    e.stopPropagation();
    const to = Math.max(0, Math.min(review, a.at + (e.key === "ArrowRight" ? 1 : -1)));
    a.go(to);
    (e.currentTarget.children[to] as HTMLElement | undefined)?.focus();
  };
  return (
    <div className="qsteps" role="tablist" aria-label="Questions" data-testid="steps" onKeyDown={onKey}>
      {ask.questions.map((q, i) => (
        <button key={q.n} id={stepId(ask, i)} role="tab" aria-selected={a.at === i} aria-controls={STEP_PANEL(ask)} tabIndex={a.at === i ? 0 : -1} data-testid={`step-${q.n}`} title={`${q.n} ${q.label}`} onClick={() => a.go(i)}>
          <span className="qnum">{q.n}</span>
          <span className="qstep-label">{q.label}</span>
          <b className="qstep-pick" aria-label={a.eff[q.n] ? `picked ${a.eff[q.n]}` : "nothing picked"}>
            {a.eff[q.n] ?? "–"}
          </b>
        </button>
      ))}
      <button id={stepId(ask, review)} role="tab" aria-selected={a.at === review} aria-controls={STEP_PANEL(ask)} tabIndex={a.at === review ? 0 : -1} data-testid="step-review" onClick={() => a.go(review)}>
        Review
      </button>
      {/* said when the step changes (a pick moves on): where the developer is now */}
      <span className="sr-only" role="status">
        {a.at === review ? "Review" : `Question ${a.at + 1} of ${review}: ${ask.questions[a.at]!.label}`}
      </span>
    </div>
  );
}

/**
 * The arrow keys of a group of radio rows: they move the keyboard between the options (Home and End to the ends) and stay in the group, so
 * they never reach the window's keys (↓ would open the next Card, → skip the ask in Focus). They move only: Space or Enter picks, because a pick
 * moves on to the next question.
 */
export function radioArrows(e: KeyboardEvent<HTMLElement>) {
  const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : e.key === "Home" ? "first" : e.key === "End" ? "last" : null;
  if (step === null || e.metaKey || e.ctrlKey || e.altKey) return;
  const radios = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')];
  const at = radios.indexOf(document.activeElement as HTMLElement);
  if (at < 0) return;
  e.preventDefault();
  e.stopPropagation();
  radios[step === "first" ? 0 : step === "last" ? radios.length - 1 : Math.max(0, Math.min(radios.length - 1, at + step))]?.focus();
}

/**
 * Keeps the keyboard in the ask when a pick replaces the question on screen: a pick made from a focused option puts the focus on the picked
 * (else the first) option of the question that follows, or on the Review step after the last one. A pick by digit leaves the focus where it was.
 */
export function useStepFocus(at: number) {
  const root = useRef<HTMLDivElement>(null);
  const carry = useRef(false);
  useEffect(() => {
    if (!carry.current) return;
    carry.current = false;
    const el = root.current;
    (el?.querySelector<HTMLElement>('.qopts [role="radio"][aria-checked="true"]') ?? el?.querySelector<HTMLElement>('.qopts [role="radio"]') ?? el?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]'))?.focus();
  }, [at]);
  /** call before a pick that may move on */
  const mark = () => void (carry.current = !!document.activeElement?.closest(".qopts"));
  return { root, mark };
}

/** The step on screen as the tab list's panel (an ask with one question has no steps: its question stands alone). */
export function StepPanel({ ask, a, className, children }: { ask: Ask; a: AskAnswer; className?: string; children: ReactNode }) {
  if (!a.multi) return className ? <div className={className}>{children}</div> : <>{children}</>;
  return (
    <div className={className} role="tabpanel" id={STEP_PANEL(ask)} aria-labelledby={stepId(ask, a.at)}>
      {children}
    </div>
  );
}

/** A question's screenshots as thumbnails that open the screenshot view on that question. */
function Shots({ q, shots, commentUrl, onOpen, onRetry }: { q: Question; shots: Screenshot[]; commentUrl: string; onOpen: (index: number) => void; onRetry: () => Promise<boolean> }) {
  if (!q.shots.length) return null;
  return (
    <div className="qshots">
      {q.shots.map((i) => {
        const s = shots[i];
        return s ? (
          <button key={i} className="qshot" onClick={() => onOpen(i)} aria-label={`Open the screenshot of ${q.n}. ${q.label}`} title={s.alt}>
            <ShotImg shot={s} commentUrl={commentUrl} onRetry={onRetry} loading="lazy" />
          </button>
        ) : null;
      })}
    </div>
  );
}

export interface QuestionShots {
  shots: Screenshot[];
  commentUrl: string;
  onOpen: (index: number) => void;
  onRetry: () => Promise<boolean>;
}

/** The agent's reason, once, under the options: "Why B: …" (the sheet and Focus alike). */
export function Why({ ask, q }: { ask: Ask; q: Question }) {
  if (!q.why) return null;
  const rec = recommendedOf(q);
  return (
    <p className="qwhy" data-testid="why">
      <b>{ask.legacy ? (rec ? "Why:" : "The agent says:") : `Why ${rec ?? ""}:`}</b> <Inline text={q.why} />
    </p>
  );
}

/**
 * One question: what it decides, its options as rows (digit, letter, name, "today", in short, ★ Recommended), the agent's reason once,
 * a note, its screenshot. `onPick` is the caller's (the sheet picks and moves on; Focus with one question sends).
 */
export function QuestionView({ ask, q, a, keys, onPick, shots, big, toggle = true }: { ask: Ask; q: Question; a: AskAnswer; keys: boolean; onPick: (q: Question, letter: string) => void; shots?: QuestionShots; big?: boolean; toggle?: boolean }) {
  const note = a.notes[q.n] ?? "";
  const [noting, setNoting] = useState(false);
  const rec = recommendedOf(q);
  const noteOpen = noting || !!note;
  const picked = a.eff[q.n];
  const addNote = !noteOpen && (
    <button className="link-quiet" data-testid="note-add" onClick={() => setNoting(true)}>
      Add a note
    </button>
  );
  return (
    <section className="qgroup" data-big={big || undefined} data-testid={`question-${q.n}`} aria-label={q.label ? `${q.n}. ${q.label}` : ask.title}>
      {q.label && (
        <header className="qhead">
          <span className="qnum" data-on>
            {q.n}
          </span>
          <b>{q.label}</b>
          {q.about && <span className="muted qabout">{q.about}</span>}
          <span className="spacer" />
          {addNote}
        </header>
      )}
      <div className="qopts" role="radiogroup" aria-label={q.label || "Options"} onKeyDown={radioArrows}>
        {q.options.map((o, i) => (
          <button
            key={o.letter}
            className="qopt"
            role="radio"
            aria-checked={picked === o.letter}
            // one stop for Tab (the picked option, else the first), the arrows move inside
            tabIndex={picked === o.letter || (i === 0 && !q.options.some((x) => x.letter === picked)) ? 0 : -1}
            data-plain={!o.name || undefined}
            data-testid={`option-${o.letter}`}
            // one question may be answered in words alone: its pick can be taken back (not where a click sends, Focus). Several questions each keep one pick.
            onClick={() => (toggle && !a.multi && picked === o.letter ? a.pick(q.n, "", true) : onPick(q, o.letter))}
          >
            {keys && i < 9 ? <kbd>{i + 1}</kbd> : <span className="qopt-nokey" aria-hidden />}
            <span className="qopt-main">
              <b className="qopt-letter">
                <Inline text={o.letter} />
              </b>
              {o.name && (
                <span className="qopt-name">
                  <Inline text={o.name} />
                </span>
              )}
              {o.today && <span className="qtoday">today</span>}
              {o.short && <span className="qopt-short">{o.short}</span>}
            </span>
            {o.recommended && (
              <span className="qopt-rec">
                <Star /> Recommended
              </span>
            )}
          </button>
        ))}
      </div>
      <Why ask={ask} q={q} />
      {noteOpen && (
        <input
          className="input qnote"
          data-testid="note"
          autoFocus={noting && !note}
          aria-label={q.label ? `Note on ${q.label}` : "Note"}
          placeholder={q.label ? `Note on ${q.label}, e.g. "but calmer"` : "Add a note, or answer in your own words"}
          value={note}
          onChange={(e) => a.setNote(q.n, e.target.value)}
          onBlur={() => !note.trim() && setNoting(false)}
          onKeyDown={(e) => submitKeys(e, () => void a.send())}
        />
      )}
      {!q.label && addNote}
      {shots && <Shots q={q} {...shots} />}
    </section>
  );
}

/** The last step: every question with what is picked for it, ★ where that is the recommendation, its note, and the way back to it. */
export function Review({ ask, a, big }: { ask: Ask; a: AskAnswer; big?: boolean }) {
  return (
    <ul className="qreview" data-big={big || undefined} data-testid="review" aria-label="Review">
      {ask.questions.map((q, i) => {
        const o = q.options.find((x) => x.letter === a.eff[q.n]);
        const note = a.notes[q.n]?.trim();
        return (
          <li key={q.n} data-testid={`review-${q.n}`}>
            <span className="qnum">{q.n}</span>
            <b className="qreview-label">{q.label}</b>
            <span className="qreview-pick">
              {o ? (
                <>
                  <b>{o.letter}</b> <Inline text={o.name} />
                  {o.recommended && (
                    <span className="qreview-rec" title="Recommended">
                      <Star />
                      <span className="sr-only">Recommended</span>
                    </span>
                  )}
                </>
              ) : (
                <span className="muted">Nothing picked</span>
              )}
              {note && <span className="muted qreview-note">“{note}”</span>}
            </span>
            <button className="btn ghost" aria-label={`Change ${q.n} ${q.label}`} onClick={() => a.go(i)}>
              Change
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** What Send will write, as it lands on GitHub. */
export function Writes({ card, comment, why }: { card: Card; comment: string | null; why: string | null }) {
  return (
    <div className="qwrites">
      <span className="qwrites-label">
        Writes on {shortRepo(card.repo)}#{card.number}
      </span>
      {comment ? <code data-testid="writes">{comment}</code> : <span className="faint">{why}</span>}
    </div>
  );
}

/**
 * A question's screenshot, full screen, with its options to pick under the image: digits pick (without moving on), ← → change the
 * screenshot (and with it the question), ⌘↵ sends the whole answer, esc closes. `index` is into the round's screenshots.
 */
export function QuestionGallery({ ask, a, shots, index, onIndex, onClose, commentUrl, onRetry }: { ask: Ask; a: AskAnswer; shots: Screenshot[]; index: number; onIndex: (i: number) => void; onClose: () => void; commentUrl: string; onRetry: () => Promise<boolean> }) {
  const root = useRef<HTMLDivElement>(null);
  // gallery order: the questions in order, each with its screenshots
  const flat = ask.questions.flatMap((q) => q.shots.map((i) => ({ q, i })));
  const pos = Math.max(0, flat.findIndex((f) => f.i === index));
  const here = flat[pos];
  const shot = here ? shots[here.i] : undefined;
  if (!here || !shot) return null;
  const { q } = here;
  const withShots = ask.questions.filter((x) => x.shots.length);
  const qPos = withShots.indexOf(q);
  const several = flat.length > withShots.length;
  const step = (d: 1 | -1) => onIndex(flat[Math.max(0, Math.min(flat.length - 1, pos + d))]!.i);
  const onKey = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === "Enter") {
      if (!a.canSend || e.repeat) return;
      void a.send();
      onClose();
    } else if (mod || e.altKey) return;
    else if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
    else if (/^[1-9]$/.test(e.key) && q.options[Number(e.key) - 1]) a.pick(q.n, q.options[Number(e.key) - 1]!.letter, true);
    else return;
    e.preventDefault();
  };
  const move = several ? "screenshot" : "question";
  return (
    <Dialog open onClose={onClose} label={`Screenshots R${ask.round}`} className="gallery" backdrop={false} testId="gallery" popupRef={root} initialFocus={root} onKeyDown={onKey}>
      <div className="gallery-bar">
        <span className="gallery-context">R{ask.round}</span>
        <strong data-testid="gallery-title">
          {q.n}. {q.label}
        </strong>
        {q.about && <span className="gallery-about">{q.about}</span>}
        <span className="gallery-count" data-testid="gallery-count">
          {qPos + 1} / {withShots.length}
        </span>
        <span style={{ flex: 1 }} />
        <Tooltip label={`Previous ${move}`} keys="←" side="bottom">
          <Btn className="btn" onClick={() => step(-1)} why={pos === 0 ? `This is the first ${move}` : null} aria-label={`Previous ${move}`}>
            ←
          </Btn>
        </Tooltip>
        <Tooltip label={`Next ${move}`} keys="→" side="bottom">
          <Btn className="btn" onClick={() => step(1)} why={pos === flat.length - 1 ? `This is the last ${move}` : null} aria-label={`Next ${move}`}>
            →
          </Btn>
        </Tooltip>
        <a className="btn" href={shot.src} target="_blank" rel="noreferrer">
          Open
          <Ext />
        </a>
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="gallery-stage" onClick={onClose}>
        <span onClick={(e) => e.stopPropagation()} style={{ display: "contents" }}>
          <ShotImg key={shot.alt + here.i} shot={shot} commentUrl={commentUrl} onRetry={onRetry} />
        </span>
      </div>
      {/* here ← → change the question (the dialog's keys), so the options are plain Tab stops */}
      <div className="gallery-picks" role="radiogroup" aria-label={`${q.n}. ${q.label}`}>
        {q.options.map((o, i) => (
          <button key={o.letter} className="btn gallery-pick" role="radio" aria-checked={a.eff[q.n] === o.letter} data-testid={`gallery-option-${o.letter}`} onClick={() => a.pick(q.n, o.letter, true)}>
            <kbd>{i + 1}</kbd>
            <b>{o.letter}</b> {o.name}
            {o.recommended && <Star />}
          </button>
        ))}
      </div>
      <KeyLegend
        groups={[
          { name: "Pick", items: [{ caps: [q.options.length > 1 ? `1–${Math.min(9, q.options.length)}` : "1"], text: "an option" }, { caps: [keyOf("send-feedback")], text: "send the answer" }] },
          { name: "Move", items: [{ caps: ["←", "→"], text: move }] },
          { name: "View", items: [{ caps: ["esc"], text: "close" }] },
        ]}
      />
    </Dialog>
  );
}

/** The quiet line under an ask's question: which decision, how old, how much, what ★ means. */
export function AskMeta({ ask, children }: { ask: Ask; children?: ReactNode }) {
  const n = ask.questions.length;
  return (
    <div className="panel-meta" data-testid="ask-meta">
      <span className="did">{ask.id}</span>
      <span className="faint">waiting {ago(ask.since)}</span>
      {n > 1 && <span className="faint">{n} questions</span>}
      {n > 1 && (
        <span className="faint qlegend">
          <Star /> picked unless you change it
        </span>
      )}
      <span className="spacer" />
      {children}
    </div>
  );
}

/** The link to the real thing: the prototype of a design round, the preview of any other request. */
export const AskLink = ({ ask, className }: { ask: Ask; className?: string }) =>
  ask.preview ? (
    <a className={className} href={ask.preview} target="_blank" rel="noreferrer">
      {ask.round !== null ? "Open prototype" : "Open preview"}
      <Ext />
    </a>
  ) : null;

/** Which screenshot of the ask's round is open in the screenshot view (null: closed), and the round's screenshots with their signed sources. */
export function useAskShots(card: Card, ask: Ask, signed: Signed, openSignal?: number) {
  const round = ask.round !== null ? card.rounds.find((r) => r.round === ask.round) : undefined;
  const [index, setIndex] = useState<number | null>(null);
  const seen = useRef(openSignal);
  const first = ask.questions.find((q) => q.shots.length)?.shots[0];
  // the palette's "Open screenshots"
  useEffect(() => {
    if (openSignal === undefined || openSignal === seen.current) return;
    seen.current = openSignal;
    if (first !== undefined) setIndex(first);
  }, [openSignal, first]);
  const shots = round ? signed.shots(round.commentId, round.screenshots) : [];
  const forQuestion: QuestionShots | undefined = round
    ? { shots, commentUrl: round.url, onOpen: (i) => (signed.ensure(round.commentId), setIndex(i)), onRetry: () => signed.retry(round.commentId) }
    : undefined;
  return { round, shots, index, open: setIndex, close: () => setIndex(null), forQuestion };
}

/**
 * The ask in the Card sheet: the question as the heading, one quiet line, the steps and the question on screen (or the one question),
 * then what will be written and Send. Pick then Send: nothing is written before Send (⌘↵ from any step).
 */
export function AskPanel({ card, ask, signed, openSignal }: { card: Card; ask: Ask; signed: Signed; openSignal?: number }) {
  const a = useAskAnswer(card, ask);
  const g = useAskShots(card, ask, signed, openSignal);
  useAskKeys(card, ask, a, g.index === null);
  const q = current(ask, a);
  const why = sendBlocked(ask, a);
  const focus = useStepFocus(a.at);
  return (
    <div className="section waiting askp" ref={focus.root} data-testid={ask.round !== null ? "panel-design-round" : "panel-decision"} data-questions={ask.questions.length}>
      <div className="panel-head">
        <div className="section-title">
          <Inline text={ask.title} />
        </div>
        <AskMeta ask={ask}>
          <AskLink ask={ask} />
        </AskMeta>
      </div>
      {a.multi && <Steps ask={ask} a={a} />}
      <StepPanel ask={ask} a={a}>
        {q ? <QuestionView key={q.n} ask={ask} q={q} a={a} keys onPick={(x, letter) => (focus.mark(), a.pick(x.n, letter))} shots={g.forQuestion} /> : <Review ask={ask} a={a} />}
      </StepPanel>
      <div className="qsend" data-testid="send-row">
        <div className="qsend-what">
          {a.summary && (
            <span className="qsummary" data-testid="summary">
              {a.summary}
            </span>
          )}
          <Writes card={card} comment={writtenComment(a)} why={why} />
        </div>
        <label className="toggle" title="Tell the running coordinator right away">
          <input type="checkbox" checked={a.push} onChange={(e) => a.setPush(e.target.checked)} data-testid="push-toggle" /> Push
        </label>
        <Btn className="btn primary" data-testid="send" why={why} onClick={() => void a.send()}>
          Send answer <kbd aria-hidden>{keyOf("send-feedback")}</kbd>
        </Btn>
      </div>
      {g.index !== null && g.round && <QuestionGallery ask={ask} a={a} shots={g.shots} index={g.index} onIndex={g.open} onClose={g.close} commentUrl={g.round.url} onRetry={() => signed.retry(g.round!.commentId)} />}
    </div>
  );
}
