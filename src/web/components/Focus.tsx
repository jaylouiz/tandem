// Focus: Waiting on me, one Card at a time. The list steps aside and each ask takes the stage as a single sheet: the blockers
// first, then the unseen Looks. Answering or marking Seen moves on by itself; j / k (or the arrows) skip and go back; Esc returns to the list.
// The Card is the store's open Card, so the Feedback panels, their keys (1-9, ⌘↵) and the palette work exactly as in the list.
import { useEffect, useMemo, useRef } from "react";
import { askOf, kindOf, tally, type Kind } from "../../core/ask.ts";
import type { Card } from "../../core/types.ts";
import { keyOf, runBinding } from "../keys.ts";
import { focusQueue, useStore } from "../store.ts";
import { Tooltip } from "../ui/Tooltip.tsx";
import { CardPane } from "./CardPane.tsx";
import { Btn, KindGlyph, RepoTag } from "./bits.tsx";

const ARROW = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 3l5 5-5 5" />
  </svg>
);

/** The end of the queue: what was done, and the two ways on. */
function Done({ done, started }: { done: Kind[]; started: boolean }) {
  const setFocus = useStore((s) => s.setFocus);
  const setView = useStore((s) => s.setView);
  return (
    <div className="focus-done" data-testid="focus-done">
      <svg className="focus-check" width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="22" cy="22" r="19" />
        <path d="M14 22.5l5.5 5.5L30.5 16" />
      </svg>
      <h2>{started && done.length ? "All clear" : "Nothing waits on you"}</h2>
      <p className="muted">{started && done.length ? `${tally(done)}. The agents take it from here.` : "Agents are on it. New asks show up here and as a notification."}</p>
      <div className="actions">
        <button className="btn primary" onClick={() => setFocus(false)}>
          Back to the list <kbd>{keyOf("escape")}</kbd>
        </button>
        <button className="btn" onClick={() => setView("board")}>
          Open the Board <kbd>{keyOf("go-board")}</kbd>
        </button>
      </div>
    </div>
  );
}

export function Focus({ cards }: { cards: Card[] }) {
  const queue = useMemo(() => focusQueue(cards), [cards]);
  const selected = useStore((s) => s.selected);
  const pending = useStore((s) => s.pending);
  const select = useStore((s) => s.select);
  const failed = useStore((s) => selected !== null && selected in s.failures);

  // every Card this Focus has had in its queue, with its kind then: what has left the queue since is done (a failed answer comes back and is not)
  const ever = useRef(new Map<string, Kind>());
  for (const c of queue) if (!ever.current.has(c.key)) ever.current.set(c.key, kindOf(c) ?? "look");
  const inQueue = new Set(queue.map((c) => c.key));
  const done = [...ever.current].filter(([k]) => !inQueue.has(k)).map(([, kind]) => kind);

  const idx = queue.findIndex((c) => c.key === selected);
  const last = useRef(0);
  const card = cards.find((c) => c.key === selected) ?? null;
  // The open Card left the queue through the developer's own action (its optimistic patch is still there): the Card that took its place opens.
  // One that left any other way (answered on GitHub, a snapshot) stays, as in the list. Nothing open, or a Card that was never in the queue: the first one.
  useEffect(() => {
    if (idx >= 0) {
      last.current = idx;
      return;
    }
    if (selected && card && ever.current.has(selected) && !pending[selected]) return;
    const next = queue[Math.min(last.current, queue.length - 1)];
    if ((next?.key ?? null) !== selected) select(next?.key ?? null);
  }, [idx, selected, card, pending, queue, select]);

  // which way the sheet comes in: forward from the right, back from the left
  const at = done.length + Math.max(idx, 0);
  const was = useRef(at);
  const dir = at < was.current ? "back" : "forward";
  useEffect(() => {
    was.current = at;
  }, [at]);

  const total = done.length + queue.length;
  const kind = card ? kindOf(card) : null;
  const next = idx >= 0 ? queue[idx + 1] : undefined;
  const isLook = !!card && idx >= 0 && kind === "look";
  const sheet = useRef<HTMLDivElement>(null);
  // a new sheet takes the keyboard's place (not a field's: typing is never interrupted), so Tab starts at the ask
  useEffect(() => {
    if (!document.activeElement || document.activeElement === document.body) sheet.current?.focus({ preventScroll: true });
  }, [selected]);

  if (!card)
    return (
      <div className="focus" data-testid="focus">
        <Done done={done} started={ever.current.size > 0} />
      </div>
    );

  return (
    <div className="focus" data-testid="focus" data-kind={kind ?? undefined}>
      <div className="focus-top">
        <div className="focus-pips" role="progressbar" aria-label="Focus progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done.length} aria-valuetext={`${done.length} of ${total} done`}>
          {Array.from({ length: total }, (_, i) => (
            <i key={i} data-state={i < done.length ? "done" : i === at && idx >= 0 ? "now" : undefined} />
          ))}
        </div>
        <span className="focus-count" data-testid="focus-count">
          {idx >= 0 ? `${at + 1} of ${total}` : `${done.length} of ${total} done`}
        </span>
      </div>
      <div className="focus-stage">
        <Tooltip label="Previous Card" keys={keyOf("previous")} side="right">
          <Btn className="focus-nav" aria-label="Previous Card" why={idx > 0 ? null : "This is the first one"} onClick={() => runBinding("previous")}>
            <span className="flip">{ARROW}</span>
          </Btn>
        </Tooltip>
        <div className="focus-sheet" ref={sheet} tabIndex={-1} key={card.key} data-dir={dir} data-failed={failed || undefined}>
          <CardPane cardKey={card.key} mode="focus" />
        </div>
        <Tooltip label={next ? "Skip to the next Card" : "Next Card"} keys={keyOf("next")} side="left">
          <Btn className="focus-nav" aria-label="Next Card" why={next ? null : "This is the last one"} onClick={() => runBinding("next")}>
            {ARROW}
          </Btn>
        </Tooltip>
      </div>
      <div className="focus-foot">
        <div className="focus-hint faint">
          {isLook ? (
            <>
              <kbd>{keyOf("seen")}</kbd> Mark Seen
            </>
          ) : (
            <>
              <kbd>1–9</kbd> pick <kbd>{keyOf("send-feedback")}</kbd> send
            </>
          )}
          <kbd>{keyOf("next")}</kbd> skip <kbd>{keyOf("escape")}</kbd> list
        </div>
        {next ? (
          <button className="focus-next" data-testid="focus-next" data-kind={kindOf(next) ?? undefined} onClick={() => runBinding("next")} title={askOf(next)}>
            <span className="faint">Up next</span>
            <KindGlyph kind={kindOf(next) ?? "look"} />
            <span className="title">{next.title}</span>
            <RepoTag repo={next.repo} number={next.number} />
          </button>
        ) : (
          <span className="focus-next faint" data-last>
            Last one
          </span>
        )}
      </div>
    </div>
  );
}
