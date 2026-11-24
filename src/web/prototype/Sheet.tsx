// proto #17 (never merged). The Card sheet without tabs. Question 1 of the round:
//   B "One page"     the ask first, then Issue, Decided and Activity as quiet sections that open in place
//   C "Ask and rail" the ask in the main column, Issue, Decided and Activity always in view in a rail beside it (below it when narrow)
// Both: one head line (repo and number, the Phase, exceptional states), the title, and a More menu that holds what is rarely needed
// (Next step, Hold Card, Needs wayfinder). Priority, the coordinator state and Start coordinator are gone (#17, #14).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { STATE_DEFAULT_TEXT, STATE_LABEL, parseLog } from "../../core/activity.ts";
import { askOf, kindOf } from "../../core/ask.ts";
import { handedValid } from "../../core/triage.ts";
import { PHASES, type Card, type Phase } from "../../core/types.ts";
import { Decided, useActivityOf, useLog } from "../components/CardPane.tsx";
import { DecisionPanel, LookPanel, PrPanel, RoundPanel } from "../components/Feedback.tsx";
import { ActDot, Btn, Chevron, Ext, Markdown, PHASE_COLOR, RepoTag, Stepper, ago, clock } from "../components/bits.tsx";
import { keyOf } from "../keys.ts";
import { useSigned } from "../signed.ts";
import { useCard, useStore } from "../store.ts";
import { TRIAGE_ENTRIES, actionBlocked, runTriage } from "../triage.ts";
import { Tooltip } from "../ui/Tooltip.tsx";
import { AskPanel } from "./Questions.tsx";
import { questionsOf } from "./questions.ts";
import { useVariant, type Variant } from "./variant.ts";

/** Question 2: the Phase as a track (five segments, the current one in its Phase colour, then its name) or as its name alone. */
export function PhaseMark({ phase, kind }: { phase: Phase; kind: Variant["phase"] }) {
  const at = PHASES.indexOf(phase);
  if (kind === "A") return <Stepper phase={phase} />;
  return (
    <span className="phase-mark" title={`Phase ${at + 1} of ${PHASES.length}: ${PHASES.join(", ")}`}>
      {kind === "B" ? (
        <span className="phase-track" aria-hidden>
          {PHASES.map((p, i) => (
            <i key={p} data-state={i < at ? "past" : i === at ? "now" : "next"} style={i === at ? { background: PHASE_COLOR[phase] } : undefined} />
          ))}
        </span>
      ) : (
        <i className="phase-dot" style={{ background: PHASE_COLOR[phase] }} aria-hidden />
      )}
      <span className="sr-only">Phase: </span>
      {phase}
    </span>
  );
}

const Dots = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
    <circle cx="3.5" cy="8" r="1.3" />
    <circle cx="8" cy="8" r="1.3" />
    <circle cx="12.5" cy="8" r="1.3" />
  </svg>
);

/** What is rarely needed on a Card: its Next step, hold, wayfinder. The keys stay (`d` `s` `b` `h` `w`); in Build this is a Base UI Menu behind `ui/`. */
function MoreMenu({ card }: { card: Card }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const handed = useStore((s) => s.handed);
  const hold = useStore((s) => s.board?.workflow.holdLabel ?? "on-hold");
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc, true);
    };
  }, [open]);
  const entry = (id: string) => TRIAGE_ENTRIES.find((e) => e.id === id)!;
  const run = (id: string) => {
    setOpen(false);
    void runTriage(entry(id), [card]);
  };
  const heldByWorkflow = card.onHold && !card.labels.includes(hold);
  const item = (id: string, label: ReactNode, on = false, why: string | null = actionBlocked(entry(id).action, [card], handed)) => (
    <Btn key={id} className="menu-item" role={on !== undefined && id.startsWith("next") ? "menuitemradio" : "menuitem"} aria-checked={id.startsWith("next") ? on : undefined} why={why} onClick={() => run(id)}>
      <span className="menu-check" aria-hidden>
        {on && (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8.5 6.5 12 13 4.5" />
          </svg>
        )}
      </span>
      <span className="menu-label">{label}</span>
      <kbd>{entry(id).key}</kbd>
    </Btn>
  );
  return (
    <div className="more" ref={root}>
      <button className="btn ghost" aria-haspopup="menu" aria-expanded={open} aria-label="More: Next step, hold" data-testid="more" onClick={() => setOpen(!open)}>
        <Dots />
      </button>
      {open && (
        <div className="menu" role="menu" aria-label="Card">
          {card.phase !== "Done" && !card.fog && (
            <>
              <div className="menu-head">Next step</div>
              {(["design", "specify", "build"] as const).map((s) => item(`next-${s}`, s, card.nextStep === s))}
              <div className="menu-sep" />
            </>
          )}
          {card.phase !== "Done" && item("hold", heldByWorkflow ? "On hold" : card.labels.includes(hold) ? "Release hold" : "Hold Card", false, heldByWorkflow ? "On hold through a workflow label; remove that label on GitHub to release it" : actionBlocked({ kind: "hold" }, [card], handed))}
          {card.phase === "Inbox" && item("fog", card.fog ? "Clear Needs wayfinder" : "Needs wayfinder")}
          <a className="menu-item" role="menuitem" href={card.url} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
            <span className="menu-check" aria-hidden />
            <span className="menu-label">
              Open on GitHub
              <Ext />
            </span>
            <kbd>{keyOf("open")}</kbd>
          </a>
        </div>
      )}
    </div>
  );
}

/** A quiet section of the one-page sheet: its name, what is in it in a few words, and its content in place when opened. */
function Fold({ id, title, summary, startOpen, children }: { id: string; title: string; summary: ReactNode; startOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <section className="fold" data-open={open || undefined} data-testid={`fold-${id}`}>
      <button className="fold-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Chevron open={open} />
        <b>{title}</b>
        <span className="fold-sum">{summary}</span>
      </button>
      {open && <div className="fold-body">{children}</div>}
    </section>
  );
}

function IssueText({ card, clamp }: { card: Card; clamp: boolean }) {
  const long = card.body.length > 420;
  const [all, setAll] = useState(!clamp || !long);
  return (
    <div className="issue-text" data-clamped={!all || undefined}>
      <Markdown text={card.body || "_No description._"} />
      {clamp && long && (
        <button className="qnote-add" onClick={() => setAll(!all)}>
          {all ? "Show less" : "Show all"}
        </button>
      )}
    </div>
  );
}

function Log({ card, limit }: { card: Card; limit?: number }) {
  const log = useLog(card, true);
  const lines = log ? parseLog(log) : [];
  if (log === undefined) return <div className="muted">Loading…</div>;
  if (log === null || !lines.length) return <div className="muted">No coordination log for this issue.</div>;
  const shown = [...lines].reverse().slice(0, limit);
  return (
    <ol className="timeline" data-testid="coordination-log">
      {shown.map((l, i) => (
        <li key={`${l.at}${i}`}>
          <span className="tl-mark" aria-hidden>
            <i />
          </span>
          <span className="tl-text">{l.text}</span>
          <span className="faint tl-at">{clock(l.at)}</span>
        </li>
      ))}
    </ol>
  );
}

export function ProtoPane({ cardKey, mode }: { cardKey: string; mode: "split" | "aside" }) {
  const v = useVariant();
  const card = useCard(cardKey);
  const select = useStore((s) => s.select);
  const failure = useStore((s) => s.failures[cardKey]);
  const clearFailure = useStore((s) => s.clearFailure);
  const handed = useStore((s) => s.handed);
  const shotsRequest = useStore((s) => s.shotsRequest);
  const act = useActivityOf(card);
  const signed = useSigned(card);
  if (!card) return null;
  const rounds = card.rounds.map((r) => ({ ...r, screenshots: signed.shots(r.commentId, r.screenshots) }));
  const look = card.look ? { ...card.look, screenshots: signed.shots(card.look.commentId, card.look.screenshots) } : null;
  const round = rounds.at(-1);
  const roundWaits = card.waiting?.kind === "design-round" && !!round;
  const lookShown = card.phase === "Done" && card.needsLook;
  const signalFor = (who: string) => (shotsRequest?.key === card.key && shotsRequest.target === who ? shotsRequest.id : undefined);
  const ask = questionsOf(card);
  // the question panel answers a decision with several questions when question 3 is B or C; one-question decisions get it with the new sheet
  const useAsk = !!ask && (ask.legacy || ask.questions.length < 2 || v.answer !== "A");
  const kind = kindOf(card);
  const handedRec = handed[cardKey];
  const answered = card.requests.filter((r) => r.answer !== null || r.resolved).length;
  const earlier = (roundWaits ? rounds.length - 1 : rounds.length) || 0;
  const decidedSum = [answered ? `${answered} answer${answered > 1 ? "s" : ""}` : "", card.agentDecisions.length ? `${card.agentDecisions.length} agent decision${card.agentDecisions.length > 1 ? "s" : ""}${card.decisionsToAccept.length ? `, ${card.decisionsToAccept.length} new` : ""}` : "", earlier ? `${earlier} earlier round${earlier > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ");
  const actSum = act ? (
    <>
      <ActDot state={act.state} /> {STATE_LABEL[act.state]} · {act.last ?? STATE_DEFAULT_TEXT[act.state]} · {ago(act.at ?? card.updatedAt)} ago
    </>
  ) : (
    `last moved ${ago(card.updatedAt)} ago`
  );

  const panel = (
    <>
      {failure && (
        <div className="section failed" role="alert" data-testid="not-sent">
          <div>
            <strong>Not sent:</strong> {failure}
          </div>
          <button className="btn ghost" onClick={() => clearFailure(card.key)}>
            Dismiss
          </button>
        </div>
      )}
      {useAsk && ask ? (
        <AskPanel key={ask.id} card={card} ask={ask} />
      ) : (
        <>
          {card.waiting?.kind === "decision" && <DecisionPanel key={card.waiting.requestId} card={card} />}
          {roundWaits && round && <RoundPanel key={`${card.key}-${round.round}`} card={card} round={round} src={signed} openSignal={signalFor("round")} />}
        </>
      )}
      {card.waiting?.kind === "pr-approval" && card.pullRequest && <PrPanel card={card} />}
      {lookShown && <LookPanel key={`look-${card.key}`} card={card} look={look} src={signed} openSignal={signalFor("look")} />}
      {card.awaitingPickup && (
        <div className="sheet-line" data-testid="awaiting-pickup">
          <ActDot state="queued" />
          <span>
            <b>Feedback given, awaiting pickup.</b> <span className="muted">{askOf(card, "pickup")}.</span>
          </span>
        </div>
      )}
      {card.phase === "Backlog" && !card.waiting && !card.awaitingPickup && !card.fog && (
        <div className="sheet-line" data-testid="hand-row">
          <span>
            Next step: <b>{card.nextStep ?? "not set"}</b>
          </span>
          <span className="spacer" />
          {handedValid(card, handedRec) ? (
            <span className="muted" data-testid="handed">
              Handed to the coordinator · {clock(new Date(handedRec!.at).toISOString())}
            </span>
          ) : (
            <Btn className="btn primary" why={actionBlocked({ kind: "hand" }, [card], handed)} onClick={() => void runTriage(TRIAGE_ENTRIES.find((e) => e.id === "hand")!, [card])}>
              Hand to agent <kbd>a</kbd>
            </Btn>
          )}
        </div>
      )}
      {card.fog && (
        <div className="sheet-line" data-testid="fog-hint">
          <span className="muted">
            Needs wayfinder: run <code>/wayfinder {card.number}</code> in a terminal
          </span>
        </div>
      )}
    </>
  );
  const decided = <Decided card={card} rounds={rounds} roundWaits={roundWaits} src={signed} signal={signalFor("earlier")} />;
  const nothingDecided = !answered && !card.agentDecisions.length && !earlier;

  return (
    <aside className={`pane ${mode} sheet`} data-sheet={v.sheet} data-testid="detail" aria-label={`Card ${card.key}`}>
      <div className="sheet-head">
        {v.phase === "A" && <Stepper phase={card.phase} />}
        <div className="sheet-top">
          <RepoTag repo={card.repo} number={card.number} />
          {v.phase !== "A" && <PhaseMark phase={card.phase} kind={v.phase} />}
          {card.onHold && <span className="chip danger">On hold</span>}
          {card.fog && <span className="chip accent">Needs wayfinder</span>}
          {card.pullRequest?.state === "open" && (
            <a className="chip ok" href={card.pullRequest.url} target="_blank" rel="noreferrer">
              PR #{card.pullRequest.number}
            </a>
          )}
          <span className="spacer" />
          <MoreMenu card={card} />
          {mode === "aside" && (
            <Tooltip label="Close the Card" keys={keyOf("escape")} side="bottom">
              <button className="btn ghost" onClick={() => select(null)} aria-label="Close">
                <kbd>{keyOf("escape")}</kbd>
              </button>
            </Tooltip>
          )}
        </div>
        <h2>{card.title}</h2>
      </div>
      {v.sheet === "B" ? (
        <div className="pane-body sheet-body">
          {panel}
          <div className="folds">
            <Fold id="issue" title="Issue" summary={(card.body || "No description").replace(/[#*_`>]/g, "").replace(/\s+/g, " ").trim().slice(0, 90)} startOpen={!kind}>
              <IssueText card={card} clamp={false} />
            </Fold>
            {!nothingDecided && (
              <Fold id="decided" title="Decided" summary={decidedSum} startOpen={card.decisionsToAccept.length > 0}>
                {decided}
              </Fold>
            )}
            {card.phase !== "Done" && (
              <Fold id="activity" title="Activity" summary={actSum} startOpen={false}>
                <Log card={card} />
              </Fold>
            )}
          </div>
        </div>
      ) : (
        <div className="pane-body sheet-body sheet-split">
          <div className="sheet-main">
            {panel}
            {!kind && !card.awaitingPickup && card.phase !== "Backlog" && <div className="muted sheet-idle">Nothing waits on you here.</div>}
          </div>
          <div className="sheet-rail">
            <section>
              <h3>Issue</h3>
              <IssueText card={card} clamp />
            </section>
            {!nothingDecided && (
              <section>
                <h3>Decided</h3>
                {decided}
              </section>
            )}
            {card.phase !== "Done" && (
              <section>
                <h3>Activity</h3>
                <div className="rail-act">{actSum}</div>
                <Log card={card} limit={4} />
              </section>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
