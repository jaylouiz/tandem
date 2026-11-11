// The pieces every cover of Focus is made of: the one-line chrome of the Card, the option tile, the note, the Send bar and the key line.
import { createContext, useContext, type KeyboardEvent, type ReactNode } from "react";
import { KIND_LABEL, askOf, kindOf, sinceOf, type Kind } from "../../../core/ask.ts";
import type { Card } from "../../../core/types.ts";
import { keyOf, runBinding } from "../../keys.ts";
import { useFocus } from "../../focus/session.ts";
import { Btn, KindGlyph, RepoTag, ago, shortRepo } from "../bits.tsx";

/** What the frame tells the cover on screen. */
export interface CoverState {
  /** the Card after this one, for Up next */
  next: Card | undefined;
  /** this ask is being written right now: it stays as it is, nothing on it sends again */
  sending: boolean;
  /** why the last send did not go through, if it did not */
  failure: string | undefined;
  /** the Card details drawer is open over the cover: the cover's keys are off */
  details: boolean;
}
export const CoverCtx = createContext<CoverState>({ next: undefined, sending: false, failure: undefined, details: false });
export const useCover = () => useContext(CoverCtx);

export const Check = () => (
  <svg className="tile-check" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 8.5 6.5 12 13 4.5" />
  </svg>
);

/** The Card's chrome, one line: kind, repo and number, title, how long it waits. Phase, issue text and earlier answers are in the drawer. */
export function Meta({ card, kind }: { card: Card; kind: Kind }) {
  const n = card.decisionsToAccept.length;
  return (
    <div className="cover-meta" data-kind={kind} data-testid="cover-meta">
      <KindGlyph kind={kind} />
      <span className="cover-kind">{KIND_LABEL[kind]}</span>
      <RepoTag repo={card.repo} number={card.number} />
      <span className="cover-title">{card.title}</span>
      <span className="faint cover-age">{kind === "look" ? (card.closedAt ? `Done ${ago(card.closedAt)} ago` : "Done") : `waiting ${ago(sinceOf(card))}`}</span>
      {n > 0 && (
        <button className="quiet-line" data-testid="decisions-line" onClick={() => useFocus.getState().setDetails(true, "decided")}>
          {n} agent decision{n > 1 ? "s" : ""}, not blocking
        </button>
      )}
    </div>
  );
}

export interface TileProps {
  n: number;
  /** the option's key (`B`) or the verdict's name */
  head: string;
  text?: string;
  /** the comment a click writes, word for word; absent while the note is open (the Send bar shows the whole comment then) */
  writes?: ReactNode;
  /** the note is open: the tile is a toggle that only picks */
  picks: boolean;
  picked: boolean;
  recommended?: string | null;
  onClick: () => void;
}

/** One option of a decision or one verdict of a PR, in the language of the Board's Cards: panel surface, elev-1, an accent ring when picked. */
export function Tile({ n, head, text, writes, picks, picked, recommended, onClick }: TileProps) {
  const { sending } = useCover();
  return (
    <Btn className="tile" data-testid={`tile-${n}`} data-picked={picked || undefined} aria-pressed={picks ? picked : undefined} why={sending ? "Sending…" : null} onClick={onClick}>
      <span className="tile-top">
        <kbd>{n}</kbd>
        <b>{head}</b>
        {picked && <Check />}
      </span>
      {text && <span className="tile-text">{text}</span>}
      {writes && (
        <code className="tile-writes" data-testid={`tile-writes-${n}`}>
          {writes}
        </code>
      )}
      {recommended !== undefined && recommended !== null && (
        <span className="tile-rec">
          <i aria-hidden />
          The agent recommends this{recommended ? `, confidence ${recommended}` : ""}
        </span>
      )}
    </Btn>
  );
}

const submitKeys = (e: KeyboardEvent, go: () => void) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    go();
  }
};

/** The note (a round's comment): closed until asked for, so an ask that one click answers shows no empty field. */
export function Note({ open, value, onChange, onOpen, onSend, addLabel, placeholder }: { open: boolean; value: string; onChange: (v: string) => void; onOpen: () => void; onSend: () => void; addLabel: string; placeholder: string }) {
  if (!open)
    return (
      <button className="btn ghost cover-note-add" data-testid="note-open" onClick={onOpen}>
        {addLabel} <kbd>{keyOf("focus-note")}</kbd>
      </button>
    );
  return <textarea className="input cover-note" data-testid="note" autoFocus aria-label={addLabel} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => submitKeys(e, onSend)} />;
}

export interface SendBarProps {
  card: Card;
  /** the note is open: the bar shows the whole comment and holds Send */
  noting: boolean;
  /** what a click does here, said once (outside the note) */
  hint: string;
  /** the comment Send writes now, or null when there is nothing to send yet */
  comment: string | null;
  /** why Send does nothing right now */
  why: string | null;
  push: boolean;
  setPush: (p: boolean) => void;
  onSend: () => void;
  /** absent when the note cannot be closed (a decision without options is answered in words) */
  onCancel?: () => void;
}

/** The bottom bar of an ask: what a click does, or the comment that will be written and its Send, or why the last one was not sent. */
export function SendBar({ card, noting, hint, comment, why, push, setPush, onSend, onCancel }: SendBarProps) {
  const { sending, failure } = useCover();
  const state = sending ? "sending" : failure ? "failed" : noting ? "note" : "hint";
  return (
    <div className="sendbar" data-testid="sendbar" data-state={state}>
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
          {noting || failure ? (
            <div className="sendbar-written">
              <span className="sendbar-label">
                Writes on {shortRepo(card.repo)}#{card.number}
              </span>
              {comment ? <code data-testid="writes">{comment}</code> : <span className="faint">{why}</span>}
            </div>
          ) : (
            <div className="sendbar-hint">{hint}</div>
          )}
        </>
      )}
      <span className="spacer" />
      <label className="toggle" title="Tell the running coordinator right away">
        <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} data-testid="push-toggle" /> Push
      </label>
      {noting && onCancel && !failure && !sending && (
        <button className="btn big" data-testid="note-cancel" onClick={onCancel}>
          Cancel <kbd>{keyOf("escape")}</kbd>
        </button>
      )}
      {(noting || failure) && !sending && (
        <Btn className="btn primary big" data-testid="send" why={why} onClick={onSend}>
          {failure ? "Send again" : "Send with note"} <kbd>{keyOf("send-feedback")}</kbd>
        </Btn>
      )}
    </div>
  );
}

/** The last line of an ask: its keys, then Up next. `hints`: [key cap, what it does]. */
export function KeyLine({ hints }: { hints: [string, string][] }) {
  const { next } = useCover();
  const nextKind = next ? (kindOf(next) ?? "look") : null;
  return (
    <div className="keyline faint" data-testid="keyline">
      <span className="keyline-keys">
        {[...hints, [keyOf("focus-next"), "skip"] as [string, string]].map(([cap, label]) => (
          <span key={cap + label}>
            <kbd>{cap}</kbd> {label}
          </span>
        ))}
      </span>
      <span className="spacer" />
      {next && nextKind ? (
        <button className="focus-next" data-testid="focus-next" data-kind={nextKind} onClick={() => runBinding("focus-next")} title={askOf(next)}>
          <span className="faint">Up next</span>
          <KindGlyph kind={nextKind} />
          <span className="title">{next.title}</span>
        </button>
      ) : (
        <span className="focus-next" data-last>
          Last one
        </span>
      )}
    </div>
  );
}
