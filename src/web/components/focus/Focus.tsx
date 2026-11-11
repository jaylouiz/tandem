// Focus ("Covers"): Waiting on me, one ask at a time, and the ask takes the whole window (the sidebar and the top bar step aside,
// `styles.css`). Each kind of ask has a cover composed for it; an option sends when it is clicked or its digit is pressed. Focus
// starts on what waits (or what is new since the last visit) and ends on a receipt of what was written.
// The ask on screen is the store's open Card, so `o`, the palette and the Feedback keys (`1`-`9`, ⌘↵ through `panelKeys`) reach it.
import { useEffect, useMemo, useRef } from "react";
import { kindOf, type Kind } from "../../../core/ask.ts";
import type { Card } from "../../../core/types.ts";
import { panelKeys } from "../../panelKeys.ts";
import { useFocusKeys } from "../../focus/keys.ts";
import { useFocus } from "../../focus/session.ts";
import { keyOf } from "../../keys.ts";
import { useSigned } from "../../signed.ts";
import { TABS, focusQueue, useStore } from "../../store.ts";
import { Dialog } from "../../ui/Dialog.tsx";
import { CardPane } from "../CardPane.tsx";
import { Ext } from "../bits.tsx";
import { DecisionCover } from "./DecisionCover.tsx";
import { LookCover } from "./LookCover.tsx";
import { PrCover } from "./PrCover.tsx";
import { RoundCover } from "./RoundCover.tsx";
import { End, Empty, Start } from "./Start.tsx";
import { CoverCtx, KeyLine, Meta } from "./parts.tsx";

/** The cover of the Card's kind. An ask Tandem cannot compose (a round without its note, an approval without its PR) says so and points to GitHub. */
function Cover({ card }: { card: Card }) {
  const signed = useSigned(card);
  const kind = kindOf(card);
  const round = card.rounds.at(-1);
  if (kind === "decision" && card.requests.some((r) => r.id === card.waiting?.requestId)) return <DecisionCover card={card} />;
  if (kind === "design-round" && round) return <RoundCover card={card} round={round} signed={signed} />;
  if (kind === "pr-approval" && card.pullRequest) return <PrCover card={card} />;
  if (kind === "look") return <LookCover card={card} signed={signed} />;
  return (
    <>
      <div className="cover-scroll">
        <div className="cover-col" data-testid="cover-other">
          <Meta card={card} kind={kind ?? "decision"} />
          <h1 className="cover-q">{card.title}</h1>
          <p className="muted">This ask has nothing Tandem can show here. Answer it on the issue.</p>
          <a className="cover-link" href={card.url} target="_blank" rel="noreferrer">
            Open on GitHub
            <Ext />
          </a>
        </div>
      </div>
      <KeyLine hints={[[keyOf("open"), "open on GitHub"]]} />
    </>
  );
}

/** The Card behind the ask: Decided, Activity and Issue (not Now: the ask is on the cover). A dialog, so Esc closes it first and no key reaches the ask under it. */
function Drawer({ card }: { card: Card }) {
  const open = useFocus((s) => s.details);
  const setDetails = useFocus((s) => s.setDetails);
  const onKey = (e: React.KeyboardEvent) => {
    const el = e.target;
    if (el instanceof HTMLElement && el.closest("input, textarea, select, [contenteditable]")) return;
    const mod = e.metaKey || e.ctrlKey;
    if (!mod && !e.altKey && (e.key === "[" || e.key === "]")) {
      const tabs = TABS.filter((t) => t.id !== "now");
      const s = useStore.getState();
      const at = Math.max(0, tabs.findIndex((t) => t.id === s.tab));
      s.setTab(tabs[(at + (e.key === "]" ? 1 : -1) + tabs.length) % tabs.length]!.id);
    } else if (!mod && !e.altKey && /^[1-9]$/.test(e.key) && panelKeys.current?.cardKey === card.key) {
      panelKeys.current.pick(Number(e.key)); // the agent decisions on Decided: the one panel that is live while the drawer is open
    } else if (mod && e.key === "Enter" && panelKeys.current?.cardKey === card.key) {
      panelKeys.current.send();
    } else return;
    e.preventDefault();
  };
  return (
    <Dialog open={open} onClose={() => setDetails(false)} label={`Card ${card.key}`} className="focus-drawer" testId="focus-drawer" onKeyDown={onKey}>
      <CardPane cardKey={card.key} mode="drawer" onClose={() => setDetails(false)} />
    </Dialog>
  );
}

export function Focus({ cards }: { cards: Card[] }) {
  const queue = useMemo(() => focusQueue(cards), [cards]);
  const selected = useStore((s) => s.selected);
  const select = useStore((s) => s.select);
  const setFocus = useStore((s) => s.setFocus);
  const failures = useStore((s) => s.failures);
  const stage = useFocus((s) => s.stage);
  const since = useFocus((s) => s.since);
  const sending = useFocus((s) => s.sending);
  const details = useFocus((s) => s.details);
  const receipt = useFocus((s) => s.receipt);
  const setStage = useFocus((s) => s.setStage);
  const setDetails = useFocus((s) => s.setDetails);

  // every Card this Focus has had in its queue, in the order it came: one pip each. What has left the queue since is done (a failed answer comes back and is not).
  const ever = useRef(new Map<string, { kind: Kind; title: string }>());
  for (const c of queue) if (!ever.current.has(c.key)) ever.current.set(c.key, { kind: kindOf(c) ?? "look", title: c.title });
  const inQueue = new Set(queue.map((c) => c.key));
  const pips = [...ever.current];

  const idx = queue.findIndex((c) => c.key === selected);
  // an ask that is being written stays as it was when it was sent, until the write is through
  const held = selected ? sending[selected] : undefined;
  const card = stage === "ask" ? (held ?? queue[idx] ?? null) : null;
  const last = useRef(0);
  // The ask on screen left the queue (answered, marked Seen, or gone any other way): the one that took its place opens; after the last one, the end.
  useEffect(() => {
    if (stage !== "ask") return;
    if (idx >= 0) {
      last.current = idx;
      return;
    }
    if (held) return;
    const next = queue[Math.min(last.current, queue.length - 1)];
    if (next) return select(next.key);
    select(null);
    setStage("end");
  }, [stage, idx, held, queue, select, setStage]);
  // the drawer belongs to the ask it was opened on
  useEffect(() => {
    if (!card && useFocus.getState().details) setDetails(false);
  }, [card, setDetails]);

  const start = (key?: string) => {
    const to = key ?? queue[0]?.key;
    if (!to) return;
    last.current = Math.max(0, queue.findIndex((c) => c.key === to));
    select(to);
    setStage("ask");
  };
  const overview = () => {
    select(null);
    setStage("start");
  };

  useFocusKeys("frame", {
    "focus-start":
      stage !== "ask" && queue.length
        ? {
            label: stage === "end" ? "Go on with the next Card" : "Start with the first Card",
            // Enter on a row, a button or a link is that control's own
            run: (e) => (e.target instanceof HTMLElement && e.target.closest("button, a, input, textarea, select") ? false : start()),
          }
        : undefined,
    "focus-details": card ? { label: "Card details: Decided, Activity, Issue", run: () => setDetails(true) } : undefined,
    escape: stage === "ask" ? { label: "Back to the Focus overview", run: overview } : undefined,
  });

  const body = useRef<HTMLDivElement>(null);
  // what is on screen takes the keyboard's place (not a field's: typing is never interrupted), so Tab starts at the ask
  useEffect(() => {
    if (!document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected) body.current?.focus({ preventScroll: true });
  }, [selected, stage]);

  const at = pips.findIndex(([k]) => k === selected);
  const done = pips.filter(([k]) => !inQueue.has(k) && !sending[k]).length;
  // while the ask is held its Card has left the queue already: the one that took its place is next
  const cover = { next: idx >= 0 ? queue[idx + 1] : queue[Math.min(last.current, queue.length - 1)], sending: !!held, failure: card ? failures[card.key] : undefined, details };

  return (
    <div className="focus" data-testid="focus" data-stage={stage} data-kind={card ? (kindOf(card) ?? undefined) : undefined}>
      <div className="focus-top">
        <span className="focus-mode">Focus</span>
        {card ? (
          <>
            <div className="focus-pips" data-testid="focus-pips" role="group" aria-label={`Focus progress: ${done} of ${pips.length} done`}>
              {pips.map(([key, p], i) => {
                const state = key === selected ? "now" : failures[key] ? "failed" : !inQueue.has(key) ? "done" : undefined;
                const open = inQueue.has(key);
                return (
                  <button
                    key={key}
                    data-state={state}
                    data-kind={p.kind}
                    data-gap={i > 0 && pips[i - 1]![1].kind !== p.kind ? true : undefined}
                    aria-label={`${p.title}${state === "done" ? ", done" : state === "failed" ? ", not sent" : state === "now" ? ", on screen" : ""}`}
                    aria-current={state === "now" ? "step" : undefined}
                    aria-disabled={open ? undefined : true}
                    title={p.title}
                    onClick={() => open && select(key)}
                  />
                );
              })}
            </div>
            <span className="focus-count" data-testid="focus-count">
              {at + 1} of {pips.length}
            </span>
            <button className="btn ghost" data-testid="focus-details" onClick={() => setDetails(true)}>
              Card <kbd>{keyOf("focus-details")}</kbd>
            </button>
            <button className="btn ghost" data-testid="focus-back" onClick={overview}>
              Overview <kbd>{keyOf("escape")}</kbd>
            </button>
          </>
        ) : (
          <>
            <span className="spacer" />
            <button className="btn ghost" data-testid="focus-leave" onClick={() => setFocus(false)}>
              Back to the list <kbd>{keyOf("escape")}</kbd>
            </button>
          </>
        )}
      </div>
      <div className="focus-body" ref={body} tabIndex={-1} key={card?.key ?? stage} data-failed={cover.failure ? true : undefined}>
        <CoverCtx.Provider value={cover}>
          {card ? <Cover card={card} /> : stage === "ask" ? null : stage === "end" ? <End receipt={receipt} queue={queue} onStart={() => start()} /> : queue.length ? <Start queue={queue} since={since} onStart={() => start()} onOpen={start} /> : <Empty />}
        </CoverCtx.Provider>
      </div>
      {card && <Drawer card={card} />}
    </div>
  );
}
