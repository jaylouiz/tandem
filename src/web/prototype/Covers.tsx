// PROTOTYPE (issue #8) · Variant A "Covers": Focus as a mode that takes the whole window. One ask per screen, each kind with
// its own composition; the Card's chrome is one line and a drawer. A fixed Send bar says, word for word, what will be written.
import { useEffect } from "react";
import { KIND_LABEL, askOf, kindOf, sinceOf } from "../../core/ask.ts";
import type { Card } from "../../core/types.ts";
import { Btn, KindGlyph, Markdown, RepoTag, Stepper, ago } from "../components/bits.tsx";
import { useStore } from "../store.ts";
import { askKeys, variantKeys } from "./keys.ts";
import { EMPTY, SINCE, askOfCard, isDone, literal, nextOpen, send, useProto, whyNot, type AskKind } from "./model.ts";
import { Checks, Facts, Failure, LookImage, Meta, Note, PushToggle, Receipt, RoundImages, Tiles, VariantTabs, ViewTools, Written, reject, tallyOf, useDraftOf, useView } from "./parts.tsx";

const MANY: Record<AskKind, [string, string]> = { "pr-approval": ["PR approval", "PR approvals"], decision: ["Decision", "Decisions"], "design-round": ["Design round", "Design rounds"], look: ["to look at", "to look at"] };

/** Round 2: a click on an option (or its digit) sends it at once. With a note open, options only pick and Send writes. */
interface Direct {
  onPick: (n: number) => void;
  onReject: (key: string) => void;
}

/** The comment a click on option n writes, without a note. */
function writesOf(card: Card, n: number): string | null {
  const ask = askOfCard(card);
  const o = ask.options[n - 1];
  if (!o) return null;
  return literal(card, { ...EMPTY, choice: ask.kind === "decision" ? o.raw : null, verdict: ask.kind === "pr-approval" ? (o.key as "approve") : null });
}

function Body({ card, onPick, onReject }: { card: Card } & Direct) {
  const ask = askOfCard(card);
  const noting = useDraftOf(card.key).noteOpen;
  if (ask.kind === "design-round")
    return (
      <div className="pv-cover-wide" data-kind={ask.kind}>
        <div className="pv-cover-bar">
          <div>
            <Meta card={card} />
            <h1 className="pv-question small">{ask.question}</h1>
          </div>
          <ViewTools ask={ask} preview={ask.round?.preview ?? null} />
        </div>
        <VariantTabs card={card} ask={ask} />
        <div className="pv-stage">
          <RoundImages card={card} ask={ask} onPick={noting ? undefined : onPick} onReject={noting ? undefined : onReject} sends={!noting} />
        </div>
        <Note card={card} addLabel="React with a comment, or pick and reject several" />
      </div>
    );
  if (ask.kind === "look")
    return (
      <div className="pv-cover-look" data-kind={ask.kind}>
        <div className="pv-stage">
          <LookImage ask={ask} />
        </div>
        <aside>
          <Meta card={card} />
          <h1 className="pv-question small">{ask.question}</h1>
          <Checks ask={ask} />
          <ViewTools ask={ask} preview={ask.look?.preview ?? null} />
        </aside>
      </div>
    );
  return (
    <div className="pv-cover-col" data-kind={ask.kind}>
      <Meta card={card} />
      <h1 className="pv-question">{ask.question}</h1>
      {ask.kind === "pr-approval" && <Facts card={card} ask={ask} />}
      <Tiles card={card} ask={ask} onPick={noting ? undefined : onPick} writes={noting ? undefined : (n) => writesOf(card, n)} />
      <Note card={card} addLabel={ask.kind === "pr-approval" ? "Send with a note" : "Answer with a note"} />
    </div>
  );
}

function SendBar({ card, onSend, onSeen, onCancel }: { card: Card; onSend: () => void; onSeen: () => void; onCancel: () => void }) {
  const d = useDraftOf(card.key);
  const st = useProto((s) => s.status[card.key]);
  const look = kindOf(card) === "look";
  const noting = d.noteOpen;
  return (
    <div className="pv-sendbar" data-status={st}>
      {st === "failed" ? (
        <Failure />
      ) : look ? (
        <div className="pv-written">
          <span className="pv-written-label">Seen stays in Tandem</span>
          <span className="faint">Nothing is written to GitHub. The Card leaves the Board 7 days after it is Seen.</span>
        </div>
      ) : noting ? (
        <Written card={card} />
      ) : (
        <div className="pv-sendbar-hint">{st === "sending" ? "Sending…" : kindOf(card) === "design-round" ? "A pick sends at once. To reject, pick several or comment, react with a comment." : "A click or its digit sends at once. Each option shows the comment it writes."}</div>
      )}
      <span className="spacer" />
      {look ? (
        <button className="btn primary big" onClick={onSeen}>
          Mark Seen <kbd>l</kbd>
        </button>
      ) : (
        <>
          <PushToggle card={card} />
          {noting && st !== "failed" && (
            <button className="btn big" onClick={onCancel}>
              Cancel <kbd>esc</kbd>
            </button>
          )}
          {(noting || st === "failed") && (
            <Btn className="btn primary big" why={st === "sending" ? "Sending" : whyNot(card, d)} onClick={onSend}>
              {st === "sending" ? "Sending…" : st === "failed" ? "Send again" : "Send with note"} <kbd>⌘↵</kbd>
            </Btn>
          )}
        </>
      )}
    </div>
  );
}

function Details({ card }: { card: Card }) {
  return (
    <aside className="pv-drawer" aria-label={`Card ${card.key}`}>
      <Stepper phase={card.phase} />
      <h2>{card.title}</h2>
      <RepoTag repo={card.repo} number={card.number} />
      <Markdown text={card.body || "_No description._"} />
      {card.requests
        .filter((r) => r.answer)
        .map((r) => (
          <p key={r.id} className="muted">
            {r.id}: {r.question} <b>{r.answer}</b>
          </p>
        ))}
      <a href={card.url} target="_blank" rel="noreferrer">
        Open on GitHub
      </a>
    </aside>
  );
}

function Start({ queue, onStart, onOpen }: { queue: Card[]; onStart: () => void; onOpen: (key: string) => void }) {
  const back = useProto((s) => s.state === "back");
  const kinds = (["pr-approval", "decision", "design-round", "look"] as AskKind[]).map((k) => [k, queue.filter((c) => kindOf(c) === k).length] as const).filter(([, n]) => n > 0);
  const blockers = queue.filter((c) => kindOf(c) !== "look").length;
  return (
    <div className="pv-start">
      <h1 className="pv-question">{back ? `${queue.length} new since ${SINCE}` : `${blockers} Cards wait on you`}</h1>
      <p className="muted">
        {kinds.map(([k, n]) => `${n} ${MANY[k][n === 1 ? 0 : 1]}`).join(", ")}
        {back ? ". Everything from before is answered." : ". Closest to Done first."}
      </p>
      <ol className="pv-start-list">
        {queue.map((c) => {
          const kind = kindOf(c) ?? "look";
          return (
            <li key={c.key}>
              <button data-kind={kind} onClick={() => onOpen(c.key)}>
                <KindGlyph kind={kind} box />
                <span className="pv-start-kind">{KIND_LABEL[kind]}</span>
                <b>{c.title}</b>
                <span className="muted">{askOf(c)}</span>
                <span className="faint">{ago(sinceOf(c))}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <button className="btn primary big" onClick={onStart}>
        Start <kbd>↵</kbd>
      </button>
    </div>
  );
}

const CheckMark = () => (
  <svg className="focus-check" width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="22" cy="22" r="19" />
    <path d="M14 22.5l5.5 5.5L30.5 16" />
  </svg>
);

export function End({ queue, onOpen, wide }: { queue: Card[]; onOpen?: (key: string) => void; wide?: boolean }) {
  const status = useProto((s) => s.status);
  const setView = useStore((s) => s.setView);
  const empty = !queue.length;
  return (
    <div className="pv-end" data-wide={wide || undefined}>
      <CheckMark />
      <h1 className="pv-question">{empty ? "Nothing waits on you" : "All clear"}</h1>
      <p className="muted">{empty ? "Agents are on it. New asks show up here and as a notification." : `${tallyOf(queue, status)}. The agents take it from here.`}</p>
      {!empty && <Receipt queue={queue} status={status} onOpen={onOpen} />}
      <div className="actions">
        <button className="btn primary" onClick={() => setView("board")}>
          Open the Board <kbd>g b</kbd>
        </button>
        <button className="btn" onClick={() => useStore.getState().setAgentsOpen(true)}>
          Agent activity <kbd>g a</kbd>
        </button>
      </div>
    </div>
  );
}

export function Covers({ queue }: { queue: Card[] }) {
  const { current, status, started, open, start, mark } = useProto();
  const details = useView((s) => s.details);
  const idx = queue.findIndex((c) => c.key === current);
  const card = idx >= 0 ? queue[idx]! : null;
  const allDone = queue.length > 0 && queue.every((c) => isDone(status[c.key]));

  useEffect(() => {
    useView.getState().set({ shown: 0, compare: false, viewport: "desktop", details: false });
  }, [current]);

  const begin = (key?: string) => {
    start();
    open(key ?? queue.find((c) => !isDone(status[c.key]))?.key ?? null);
  };
  const advance = (from: Card) => open(nextOpen(queue, useProto.getState().status, from.key));
  const doSend = () => card && void send(card).then((ok) => ok && advance(card));
  const doSeen = () => {
    if (!card) return;
    mark(card.key, "seen");
    advance(card);
  };
  /** a click or a digit outside note mode: this option is the whole answer and goes out at once (Send back first asks for its note) */
  const direct = (n: number) => {
    if (!card) return;
    const st = useProto.getState();
    if (st.status[card.key] === "sending" || isDone(st.status[card.key])) return;
    const ask = askOfCard(card);
    const o = ask.options[n - 1];
    if (!o) return;
    const base = { ...EMPTY, push: (st.drafts[card.key] ?? EMPTY).push };
    if (ask.kind === "pr-approval" && o.key === "send-back") {
      st.edit(card.key, { ...base, verdict: "send-back", noteOpen: true });
      requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>("[data-note]")?.focus());
      return;
    }
    st.edit(card.key, ask.kind === "decision" ? { ...base, choice: o.raw } : ask.kind === "pr-approval" ? { ...base, verdict: o.key as "approve" } : { ...base, picks: [o.key] });
    if (ask.kind === "design-round") useView.getState().set({ shown: n - 1 });
    doSend();
  };
  const rejectWithNote = (key: string) => {
    if (!card) return;
    useProto.getState().edit(card.key, { noteOpen: true });
    reject(card, key);
  };
  const cancelNote = () => card && useProto.getState().clear(card.key);
  const go = (dir: 1 | -1) => {
    const next = queue[idx + dir];
    if (next) open(next.key);
  };

  const noting = !!card && (useProto.getState().drafts[card.key] ?? EMPTY).noteOpen;
  variantKeys.current = (e, typing) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      doSend();
      return true;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return false;
    if (!started || !card) {
      if (e.key === "Enter" && queue.length && !allDone) return begin(), true;
      if (e.key === "Escape" && started) return useProto.setState({ started: false, current: null }), true;
      return false;
    }
    switch (e.key) {
      case "ArrowRight":
      case "j":
        return go(1), true;
      case "ArrowLeft":
      case "k":
        return go(-1), true;
      case "l":
        if (kindOf(card) !== "look") return false;
        return doSeen(), true;
      case "i":
        return useView.getState().set({ details: !details }), true;
      case "Escape":
        if (details) return useView.getState().set({ details: false }), true;
        if (noting) return cancelNote(), true;
        return useProto.setState({ started: false, current: null }), true;
    }
    if (!noting && /^[1-9]$/.test(e.key)) return direct(Number(e.key)), true;
    if (!noting && e.key === "x" && kindOf(card) === "design-round") {
      const o = askOfCard(card).options[useView.getState().shown];
      if (o) rejectWithNote(o.key);
      return true;
    }
    return askKeys(e, card);
  };

  if (!queue.length || (started && !card))
    return (
      <div className="pv-covers">
        <End queue={queue} onOpen={(key) => open(key)} />
      </div>
    );
  if (!started || !card)
    return (
      <div className="pv-covers">
        {allDone ? <End queue={queue} onOpen={begin} /> : <Start queue={queue} onStart={() => begin()} onOpen={begin} />}
      </div>
    );

  const kind = kindOf(card) ?? "look";
  const next = queue[idx + 1];
  return (
    <div className="pv-covers" data-kind={kind}>
      <div className="pv-covers-top">
        <span className="pv-covers-mode">Focus</span>
        <div className="pv-pips" role="progressbar" aria-label="Focus progress" aria-valuemin={0} aria-valuemax={queue.length} aria-valuenow={queue.filter((c) => isDone(status[c.key])).length}>
          {queue.map((c, i) => (
            <button
              key={c.key}
              aria-label={`${c.title}${isDone(status[c.key]) ? ", done" : ""}`}
              title={c.title}
              data-state={c.key === current ? "now" : status[c.key] === "failed" ? "failed" : isDone(status[c.key]) ? "done" : undefined}
              data-gap={i > 0 && kindOf(queue[i - 1]!) !== kindOf(c) ? true : undefined}
              onClick={() => open(c.key)}
            />
          ))}
        </div>
        <span className="focus-count">
          {idx + 1} of {queue.length}
        </span>
        <button className="btn ghost" aria-pressed={details} onClick={() => useView.getState().set({ details: !details })}>
          Card <kbd>i</kbd>
        </button>
        <button className="btn ghost" onClick={() => useProto.setState({ started: false, current: null })}>
          Overview <kbd>esc</kbd>
        </button>
      </div>
      <div className="pv-cover" key={card.key}>
        <Body card={card} onPick={direct} onReject={rejectWithNote} />
        {details && <Details card={card} />}
      </div>
      <SendBar card={card} onSend={doSend} onSeen={doSeen} onCancel={cancelNote} />
      <div className="pv-legend faint">
        {kind === "look" ? (
          <>
            <kbd>l</kbd> Mark Seen
          </>
        ) : noting ? (
          <>
            <kbd>1–{askOfCard(card).options.length}</kbd> pick <kbd>⌘↵</kbd> send <kbd>esc</kbd> cancel the note
          </>
        ) : kind === "design-round" ? (
          <>
            <kbd>1–3</kbd> send that pick <kbd>[</kbd>
            <kbd>]</kbd> variant <kbd>c</kbd> side by side <kbd>n</kbd> comment
          </>
        ) : (
          <>
            <kbd>1–{askOfCard(card).options.length}</kbd> send <kbd>n</kbd> with a note
          </>
        )}
        <kbd>→</kbd> skip
        <span className="spacer" />
        {next ? (
          <button className="pv-upnext" data-kind={kindOf(next) ?? undefined} onClick={() => go(1)}>
            <span className="faint">Up next</span>
            <KindGlyph kind={kindOf(next) ?? "look"} />
            <span className="title">{next.title}</span>
          </button>
        ) : (
          <span>Last one</span>
        )}
      </div>
    </div>
  );
}
