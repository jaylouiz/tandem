// PROTOTYPE (issue #8) · Variant B "Run": no sheet and no stage. The asks are one column; the open one is unfolded for its kind.
// A digit picks and moves on, so a Card costs one key. Nothing is written until Send all: the ledger on the right lists every
// answer in the words that will be written, and stays as the receipt.
import { useEffect, useRef } from "react";
import { askOf, kindOf, sinceOf } from "../../core/ask.ts";
import type { Card } from "../../core/types.ts";
import { Btn, KindGlyph, RepoTag, ago } from "../components/bits.tsx";
import { End } from "./Covers.tsx";
import { askKeys, variantKeys } from "./keys.ts";
import { EMPTY, FAILURE, SINCE, askOfCard, canSend, isDone, literal, send, sets, useProto } from "./model.ts";
import { Check, Checks, Facts, LookImage, Meta, Note, RoundImages, Tiles, VariantTabs, ViewTools, tallyOf, useView } from "./parts.tsx";

function Open({ card, onNext, onSeen }: { card: Card; onNext: () => void; onSeen: () => void }) {
  const ask = askOfCard(card);
  return (
    <section className="pv-run-open" data-kind={ask.kind} aria-label={card.title}>
      <Meta card={card} link />
      <h2 className="pv-run-q">{ask.question}</h2>
      {ask.kind === "pr-approval" && <Facts card={card} ask={ask} />}
      {(ask.kind === "decision" || ask.kind === "pr-approval") && <Tiles card={card} ask={ask} dense />}
      {ask.kind === "design-round" && (
        <>
          <div className="pv-run-tools">
            <VariantTabs card={card} ask={ask} />
            <ViewTools ask={ask} preview={ask.round?.preview ?? null} />
          </div>
          <RoundImages card={card} ask={ask} />
        </>
      )}
      {ask.kind === "look" && (
        <>
          <div className="pv-run-tools">
            <Checks ask={ask} />
            <ViewTools ask={ask} preview={ask.look?.preview ?? null} />
          </div>
          <LookImage ask={ask} />
        </>
      )}
      {ask.kind !== "look" && <Note card={card} />}
      <div className="pv-run-foot faint">
        {ask.kind === "look" ? (
          <>
            <button className="btn primary" onClick={onSeen}>
              Mark Seen <kbd>l</kbd>
            </button>
            <span className="spacer" />
            <kbd>↵</kbd> later
          </>
        ) : ask.kind === "design-round" ? (
          <>
            <kbd>1–3</kbd> pick <kbd>x</kbd> reject <kbd>c</kbd> one or all <kbd>n</kbd> comment
            <span className="spacer" />
            <button className="btn" onClick={onNext}>
              Next <kbd>↵</kbd>
            </button>
          </>
        ) : (
          <>
            <kbd>1–{ask.options.length}</kbd> picks and moves on <kbd>n</kbd> note <kbd>u</kbd> undo the pick
            <span className="spacer" />
            <kbd>↵</kbd> skip
          </>
        )}
      </div>
    </section>
  );
}

function Line({ card, onOpen }: { card: Card; onOpen: () => void }) {
  const d = useProto((s) => s.drafts[card.key]) ?? EMPTY;
  const st = useProto((s) => s.status[card.key]);
  const kind = kindOf(card) ?? "look";
  const text = literal(card, d);
  return (
    <button className="pv-run-line" data-kind={kind} data-status={st} data-answered={!!text || undefined} onClick={onOpen}>
      <KindGlyph kind={kind} box />
      <span className="pv-run-line-main">
        <span className="title">{card.title}</span>
        <span className="ask">{st === "seen" ? "Marked Seen" : text ? text.split("\n").join(" ") : askOf(card)}</span>
      </span>
      <RepoTag repo={card.repo} number={card.number} />
      <span className="pv-run-line-state">
        {isDone(st) ? (
          <>
            <Check /> {st === "seen" ? "Seen" : "Sent"}
          </>
        ) : st === "failed" ? (
          <span className="pv-danger">Not sent</span>
        ) : text ? (
          "Ready"
        ) : (
          <span className="faint">{ago(sinceOf(card))}</span>
        )}
      </span>
    </button>
  );
}

function Ledger({ queue, onSendAll, busy }: { queue: Card[]; onSendAll: () => void; busy: boolean }) {
  const { drafts, status, clear, open } = useProto();
  const lines = queue.filter((c) => kindOf(c) !== "look" && (canSend(c, drafts[c.key] ?? EMPTY) || status[c.key]));
  const ready = lines.filter((c) => !isDone(status[c.key]) && canSend(c, drafts[c.key] ?? EMPTY));
  const open_ = queue.filter((c) => !isDone(status[c.key]) && !ready.includes(c)).length;
  const sent = lines.filter((c) => status[c.key] === "sent").length;
  return (
    <aside className="pv-ledger" aria-label="Your Feedback">
      <div className="pv-ledger-head">
        <h2>Your Feedback</h2>
        <span className="faint">{sent ? `${sent} sent` : "Nothing is written yet"}</span>
      </div>
      <ol className="pv-ledger-lines">
        {!lines.length && (
          <li className="pv-ledger-empty muted">
            Pick an answer and it is listed here, in the words that will be written. Nothing leaves before <b>Send all</b>.
          </li>
        )}
        {lines.map((c) => {
          const d = drafts[c.key] ?? EMPTY;
          const st = status[c.key];
          return (
            <li key={c.key} data-status={st} data-kind={kindOf(c) ?? undefined}>
              <button className="pv-ledger-main" onClick={() => open(c.key)} title="Open this Card">
                <span className="pv-ledger-title">
                  <KindGlyph kind={kindOf(c) ?? "look"} /> {c.title} <span className="faint">#{c.number}</span>
                </span>
                <code>{literal(c, d)}</code>
                {st === "failed" ? <span className="pv-danger">Not sent. {FAILURE}</span> : <span className="faint">{st === "sending" ? "Sending…" : st === "sent" ? sets(c, d) : d.push ? "With Push" : "Without Push"}</span>}
              </button>
              {st === "sent" ? (
                <span className="pv-ledger-state">
                  <Check /> Sent
                </span>
              ) : st === "sending" ? null : (
                <button className="btn ghost" aria-label={`Take ${c.title} out`} title="Take it out (u)" onClick={() => clear(c.key)}>
                  Remove
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <div className="pv-ledger-foot">
        <span className="faint">{open_ ? `${open_} without an answer stay Waiting on me` : ready.length ? "Every ask has an answer" : ""}</span>
        <Btn className="btn primary big" why={busy ? "Sending" : ready.length ? null : "Pick an answer first"} onClick={onSendAll}>
          {busy ? "Sending…" : lines.some((c) => status[c.key] === "failed") ? `Send ${ready.length} again` : `Send all ${ready.length || ""}`} <kbd>⌘↵</kbd>
        </Btn>
      </div>
    </aside>
  );
}

export function Run({ queue }: { queue: Card[] }) {
  const { current, status, drafts, open, mark, state } = useProto();
  const busy = queue.some((c) => status[c.key] === "sending");
  const allDone = queue.length > 0 && queue.every((c) => isDone(status[c.key]));
  const idx = queue.findIndex((c) => c.key === current);
  const card = idx >= 0 ? queue[idx]! : null;
  const list = useRef<HTMLDivElement>(null);

  // the first ask that has no answer yet is open; a round shows all its variants at once here
  useEffect(() => {
    if (!current && !useProto.getState().current && queue.length && !allDone) open(queue.find((c) => !isDone(status[c.key]))?.key ?? null);
  }, [current, queue, allDone, status, open]);
  useEffect(() => {
    const c = queue.find((x) => x.key === current);
    useView.getState().set({ shown: 0, compare: !!c && kindOf(c) === "design-round", viewport: "desktop", details: false });
    list.current?.querySelector(".pv-run-open")?.scrollIntoView({ block: "nearest" });
  }, [current, queue]);

  /** the next ask without an answer, below the open one first */
  const onward = (from: Card) => {
    const s = useProto.getState();
    const waits = (c: Card) => c.key !== from.key && !isDone(s.status[c.key]) && !canSend(c, s.drafts[c.key] ?? EMPTY);
    const at = queue.indexOf(from);
    const next = [...queue.slice(at + 1), ...queue.slice(0, at)].find(waits);
    if (next) open(next.key);
  };
  const step = (dir: 1 | -1) => {
    const next = queue[idx + dir];
    if (next) open(next.key);
  };
  const sendAll = async () => {
    for (const c of queue) {
      const s = useProto.getState();
      if (!isDone(s.status[c.key]) && canSend(c, s.drafts[c.key] ?? EMPTY)) await send(c);
    }
    const s = useProto.getState();
    const left = queue.find((c) => !isDone(s.status[c.key]));
    open(left?.key ?? null);
  };
  const seen = (c: Card) => {
    mark(c.key, "seen");
    onward(c);
  };

  variantKeys.current = (e, typing) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      if (!busy) void sendAll();
      return true;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey || !card) return false;
    const kind = kindOf(card);
    switch (e.key) {
      case "j":
      case "ArrowDown":
        return step(1), true;
      case "k":
      case "ArrowUp":
        return step(-1), true;
      case "Enter":
        return onward(card), true;
      case "u":
        return useProto.getState().clear(card.key), true;
      case "l":
        if (kind !== "look") return false;
        return seen(card), true;
    }
    if (isDone(status[card.key])) return false;
    const took = askKeys(e, card);
    // a pick that is a whole answer moves on: one key per Card. A round takes several picks, Send back needs its note.
    if (took && /^[1-9]$/.test(e.key) && kind !== "design-round") {
      const d = useProto.getState().drafts[card.key] ?? EMPTY;
      if (canSend(card, d)) setTimeout(() => onward(card), 160);
    }
    return took;
  };

  if (!queue.length || allDone)
    return (
      <div className="pv-run" data-done>
        <div className="pv-run-stream">
          <End queue={queue} wide />
        </div>
      </div>
    );
  const blockers = queue.filter((c) => kindOf(c) !== "look").length;
  const answered = queue.filter((c) => isDone(status[c.key]) || canSend(c, drafts[c.key] ?? EMPTY)).length;
  return (
    <div className="pv-run">
      <div className="pv-run-stream" ref={list}>
        <div className="pv-run-head">
          <h2>{state === "back" ? `${queue.length} new since ${SINCE}` : `${blockers} Cards wait on you`}</h2>
          <span className="faint">
            {answered} of {queue.length} have an answer{tallyOf(queue, status) ? ` · ${tallyOf(queue, status)}` : ""}
          </span>
        </div>
        {queue.map((c) => (c.key === current && !isDone(status[c.key]) ? <Open key={c.key} card={c} onNext={() => onward(c)} onSeen={() => seen(c)} /> : <Line key={c.key} card={c} onOpen={() => open(c.key)} />))}
      </div>
      <Ledger queue={queue} onSendAll={() => void sendAll()} busy={busy} />
    </div>
  );
}
