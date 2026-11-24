// The Card sheet (#17): one page, no tabs. One head line (repo and number, the Phase as a track, what is exceptional, More), the title,
// then what the Card asks (the one raised panel), then Issue, Decided and Activity as folds that open in place. Everything is said once.
// The rare actions (Next step, hold, Needs wayfinder, GitHub) live in the More menu and keep their keys.
import { useEffect, useRef, useState } from "react";
import { STATE_DEFAULT_TEXT, STATE_LABEL, classifyActivity, parseLog, type Activity } from "../../core/activity.ts";
import { askOf, hasAskPanel, decidedParts, decidedSummary, decisionState, foldStart, issueSummary, type FoldId } from "../../core/ask.ts";
import type { ShotsTarget } from "../../core/gallery.ts";
import { askQuestions } from "../../core/questions.ts";
import { startNotice, startRequests } from "../../core/triage.ts";
import type { Card, DesignRound } from "../../core/types.ts";
import { useSigned } from "../signed.ts";
import { api, useActivity, useCard, useNow, useStore } from "../store.ts";
import { TRIAGE_ENTRIES, actionBlocked, runTriage } from "../triage.ts";
import { AgentDecisionPanel, DecisionPanel, EarlierRounds, LookPanel, PrPanel, RoundPanel } from "./Feedback.tsx";
import { AskPanel } from "./Questions.tsx";
import { ActDot, Btn, Ext, Inline, Markdown, PhaseTrack, RepoTag, agoText, clock } from "./bits.tsx";
import { Fold } from "./sheet/Fold.tsx";
import { CloseKey, MoreMenu } from "./sheet/MoreMenu.tsx";

/** The coordination log of one Card, fetched when `enabled` and again when the Card's last log line changes. */
function useLog(card: Card, enabled: boolean): string | null | undefined {
  const [log, setLog] = useState<string | null | undefined>(undefined);
  const stamp = useStore((s) => s.board?.activity[card.key]?.at ?? null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    api.get<{ log: string | null }>(`${api.cardPath(card)}/log`).then(
      (r) => live && setLog(r.log),
      () => live && setLog(null),
    );
    return () => {
      live = false;
    };
  }, [enabled, card.repo, card.number, stamp]);
  return log;
}

function useActivityOf(card: Card | null): Activity | null {
  const activity = useActivity();
  const cfg = useStore((s) => s.board?.workflow);
  const now = useNow();
  return card && cfg ? classifyActivity(card, activity[card.key], now, cfg) : null;
}

/** Where the Card stands, in one line: the agent's state, what it last reported and when; without agent activity, when the Card last moved (#20: "just now", never "now ago"). */
function ActivityLine({ card, act }: { card: Card; act: Activity | null }) {
  if (!act) return <>Moved {agoText(card.updatedAt)}</>;
  return (
    <span className="act-line" data-state={act.state}>
      {/* the label beside it names the state: the dot is not said a second time */}
      <span className="act-mark" aria-hidden>
        <ActDot state={act.state} />
      </span>
      <b>{STATE_LABEL[act.state]}</b>
      <span className="act-sep">{" · "}</span>
      <span className="act-last">{act.last ?? STATE_DEFAULT_TEXT[act.state]}</span>
      <span className="act-sep">{" · "}</span>
      <span className="act-at">{agoText(act.at)}</span>
    </span>
  );
}

/** The coordination log, newest first. Fetched when the fold opens. */
function Log({ card }: { card: Card }) {
  const log = useLog(card, true);
  const lines = log ? parseLog(log) : [];
  return (
    <div data-testid="coordination-log">
      {log === undefined ? (
        <div className="muted">Loading…</div>
      ) : log === null ? (
        <div className="muted">No coordination log for this issue.</div>
      ) : lines.length ? (
        <ol className="timeline">
          {[...lines].reverse().map((l, i) => (
            <li key={`${l.at}${i}`}>
              <span className="tl-mark" aria-hidden>
                <i />
              </span>
              <span className="tl-text">{l.text}</span>
              <span className="faint tl-at">{clock(l.at)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="log">{log}</div>
      )}
    </div>
  );
}

/** What was decided on this Card: the developer's answers, the agents' decisions (the new ones to accept or challenge), the rounds that are over. */
function Decided({ card, rounds, roundWaits, src, signal, keys }: { card: Card; rounds: DesignRound[]; roundWaits: boolean; src: ReturnType<typeof useSigned>; signal: number | undefined; keys: boolean }) {
  const answered = card.requests.filter((r) => r.answer !== null || r.resolved);
  const earlier = roundWaits ? rounds.slice(0, -1) : rounds;
  return (
    <div className="decided" data-testid="decided">
      {answered.length > 0 && (
        <>
          <div className="sec-h">Your answers</div>
          {answered.map((r) => (
            <div key={r.id} className="decided-row">
              <span className="did">{r.id}</span>
              <div className="decided-body">
                <span>
                  <Inline text={r.question} />
                </span>
                {r.answer && <p className="decided-answer">{r.answer}</p>}
              </div>
              <span className="chip ok">{r.answer ? "Answered" : "Resolved"}</span>
            </div>
          ))}
        </>
      )}
      {card.agentDecisions.length > 0 && (
        <>
          <div className="sec-h">Agent decisions</div>
          {card.decisionsToAccept.length > 0 && <AgentDecisionPanel card={card} keys={keys} />}
          {card.agentDecisions
            .filter((d) => decisionState(card, d) !== "new")
            .map((d) => (
              <div key={d.id} className="decided-row">
                <span className="did">{d.id}</span>
                <span>{d.title}</span>
                <span className={decisionState(card, d) === "challenged" ? "chip accent" : "chip"}>{decisionState(card, d) === "challenged" ? "Challenged" : "Accepted"}</span>
              </div>
            ))}
        </>
      )}
      {earlier.length > 0 && <EarlierRounds key={`earlier-${card.key}`} rounds={earlier} label={roundWaits ? "Earlier rounds" : "Design rounds"} src={src} openSignal={signal} startOpen />}
    </div>
  );
}

/** The one action of a Backlog Card nobody waits on: hand it to the coordinator with its Next step. Once handed (the issue's status says so, #18), it says so in place. */
function HandRow({ card }: { card: Card }) {
  const isHanded = !!card.handed;
  const handedRef = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  /** the Hand button (or the handed text) holds the keyboard */
  const refocus = useRef(false);
  // the Hand button and the handed text swap places: keep the keyboard where it was (also when a failed Push or a hold swaps them back)
  useEffect(() => {
    if (isHanded && refocus.current) handedRef.current?.focus();
    else if (!isHanded && refocus.current && document.activeElement === document.body) btnRef.current?.focus();
    refocus.current = isHanded && document.activeElement === handedRef.current;
  }, [isHanded]);
  return (
    <div className="sheet-line" data-testid="hand-row">
      <span>
        Next step: <b>{card.nextStep ?? "not set"}</b>
      </span>
      <span className="spacer" />
      {isHanded ? (
        <span className="handed" data-testid="handed" tabIndex={-1} ref={handedRef}>
          <span>Handed to the coordinator</span>
          <span className="muted">Hold and release to hand again</span>
        </span>
      ) : (
        <Btn
          ref={btnRef}
          className="btn primary"
          data-testid="hand"
          onClick={() => {
            refocus.current = true;
            void runTriage(TRIAGE_ENTRIES.find((e) => e.id === "hand")!, [card]);
          }}
          why={actionBlocked({ kind: "hand" }, [card])}
        >
          Hand to agent <kbd>a</kbd>
        </Btn>
      )}
    </div>
  );
}

/** A Card that needs wayfinder has no Next step: the one way out is the command, to run in a terminal. */
function WayfinderLine({ card }: { card: Card }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="sheet-line" data-testid="fog-hint">
      <span className="muted">
        Needs wayfinder: run <code>/wayfinder {card.number}</code> in a terminal
      </span>
      <span className="spacer" />
      <button
        className="btn"
        aria-label={`Copy /wayfinder ${card.number}`}
        onClick={() => {
          void navigator.clipboard?.writeText(`/wayfinder ${card.number}`);
          setCopied(true);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/**
 * `split`: beside the Waiting on me list; `aside`: beside the Board (it has a close key); `drawer`: the Card behind an ask of Focus
 * (`focus/Focus.tsx`): the same sheet without what the cover already shows (the ask) and without the actions that change the Card.
 */
export function CardPane({ cardKey, mode, onClose }: { cardKey: string; mode: "split" | "aside" | "drawer"; onClose?: () => void }) {
  const card = useCard(cardKey);
  const select = useStore((s) => s.select);
  const drawer = mode === "drawer";
  const failure = useStore((s) => s.failures[cardKey]);
  const clearFailure = useStore((s) => s.clearFailure);
  const shotsRequest = useStore((s) => s.shotsRequest);
  const foldRequest = useStore((s) => s.foldRequest);
  const act = useActivityOf(card);
  const signed = useSigned(card);
  // Which folds are open belongs to this opening of the Card (the pane is keyed by the Card): it starts from what is new and is the
  // developer's from then on. Nothing opens or closes by itself afterwards, also not when the Card's state changes under it.
  const [open, setOpen] = useState<Record<FoldId, boolean> | null>(() => (card ? { ...foldStart(card), ...(drawer ? { issue: true } : {}) } : null));
  const [reveal, setReveal] = useState<{ fold: FoldId; id: number } | null>(null);
  useEffect(() => {
    if (card && !open) setOpen({ ...foldStart(card), ...(drawer ? { issue: true } : {}) }); // the Card arrived after the pane (a link opened before the first snapshot)
  }, [card, open, drawer]);
  // a fold asked for from outside (palette, Agent activity, the agent decisions line of Focus) opens and comes into view; the request is spent
  useEffect(() => {
    if (!foldRequest || foldRequest.key !== cardKey || !open) return;
    setOpen({ ...open, [foldRequest.fold]: true });
    setReveal({ fold: foldRequest.fold, id: foldRequest.id });
    useStore.setState({ foldRequest: null });
  }, [foldRequest, cardKey, open]);
  // the palette's "Open screenshots" may name the rounds in Decided: that fold opens for it
  useEffect(() => {
    if (shotsRequest?.key === cardKey && shotsRequest.target === "earlier") setOpen((o) => (o && !o.decided ? { ...o, decided: true } : o));
  }, [shotsRequest, cardKey]);
  // Closing the aside (its Close button, Esc, a click on empty space) hands focus back to the Card or row that opened it (#42). Only when focus
  // was lost with the pane (it sits on `body` now): another Card selected, a view or a dialog opened, or focus put elsewhere keep theirs.
  useEffect(
    () => () => {
      if (mode === "aside" && useStore.getState().selected === null && (!document.activeElement || document.activeElement === document.body))
        document.querySelector<HTMLElement>(`.card[data-card="${cardKey}"], .qrow[data-card="${cardKey}"]`)?.focus();
    },
    [mode, cardKey],
  );
  if (!card || !open) return null;
  // screenshots with their signed sources (private repos), see signed.ts
  const rounds = card.rounds.map((r) => ({ ...r, screenshots: signed.shots(r.commentId, r.screenshots) }));
  const look = card.look ? { ...card.look, screenshots: signed.shots(card.look.commentId, card.look.screenshots) } : null;
  const round = rounds.at(-1);
  const roundWaits = card.waiting?.kind === "design-round" && !!round;
  const lookShown = card.phase === "Done" && card.needsLook;
  // a Card that changes afterwards (Send moves the round to "earlier") never re-targets the panel
  const signalFor = (who: ShotsTarget) => (shotsRequest?.key === card.key && shotsRequest.target === who ? shotsRequest.id : undefined);
  const ask = drawer ? null : askQuestions(card);
  const parts = decidedParts(card);
  const toggle = (f: FoldId) => setOpen({ ...open, [f]: !open[f] });
  const revealOf = (f: FoldId) => (reveal?.fold === f ? reveal.id : undefined);
  const close = () => (onClose ? onClose() : select(null));

  return (
    <aside className={`pane sheet ${mode}`} data-testid="detail" aria-label={`Card ${card.key}`}>
      <div className="sheet-head">
        <div className="sheet-top">
          <RepoTag repo={card.repo} number={card.number} />
          <PhaseTrack phase={card.phase} />
          {card.onHold && <span className="chip danger">On hold</span>}
          {card.fog && <span className="chip accent">Needs wayfinder</span>}
          {card.pullRequest?.state === "open" && (
            <a className="chip ok" href={card.pullRequest.url} target="_blank" rel="noreferrer" title="Open the pull request on GitHub">
              PR #{card.pullRequest.number}
            </a>
          )}
          <span className="spacer" />
          {/* the Card behind an ask of Focus is not changed from here: its drawer only leads to GitHub */}
          {drawer ? (
            <a className="btn ghost" href={card.url} target="_blank" rel="noreferrer">
              GitHub
              <Ext />
            </a>
          ) : (
            <MoreMenu card={card} />
          )}
          {(mode === "aside" || drawer) && <CloseKey label={drawer ? "Close the Card details" : "Close the Card"} onClose={close} />}
        </div>
        <h2>{card.title}</h2>
      </div>
      <div className="pane-body sheet-body">
        {!drawer && (
          <div className="sheet-ask" data-testid="sheet-ask">
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
            {ask ? (
              <AskPanel key={`${card.key}-${ask.id}`} card={card} ask={ask} signed={signed} openSignal={signalFor("round")} />
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
            {card.phase === "Backlog" && !card.waiting && !card.awaitingPickup && !card.fog && <HandRow key={card.key} card={card} />}
            {card.fog && card.phase !== "Done" && <WayfinderLine key={card.key} card={card} />}
          </div>
        )}
        <div className="folds">
          <Fold id="issue" title="Issue" summary={issueSummary(card.body)} open={open.issue} onToggle={() => toggle("issue")} reveal={revealOf("issue")}>
            <div className="issue-text">{card.body.trim() ? <Markdown text={card.body} /> : <span className="muted">No description.</span>}</div>
          </Fold>
          {parts.answers + parts.decisions + parts.rounds > 0 && (
            <Fold id="decided" title="Decided" summary={decidedSummary(card)} open={open.decided} onToggle={() => toggle("decided")} reveal={revealOf("decided")}>
              {/* the ask panel owns the digits and ⌘↵ while it is there; else the agent decisions take them */}
              <Decided card={card} rounds={rounds} roundWaits={roundWaits} src={signed} signal={signalFor("earlier")} keys={drawer || !hasAskPanel(card)} />
            </Fold>
          )}
          {card.phase !== "Done" && (
            <Fold id="activity" title="Activity" summary={<ActivityLine card={card} act={act} />} open={open.activity} onToggle={() => toggle("activity")} reveal={revealOf("activity")}>
              <div className="act-head" data-testid="status">
                <ActivityLine card={card} act={act} />
              </div>
              <Log card={card} />
            </Fold>
          )}
        </div>
      </div>
    </aside>
  );
}

/** Start a coordinator per repo for these Cards, all repos at once (a Card's own button passes one Card). It starts with their numbers, so the server sets their handed status; repos that failed stay on the toast for a retry. */
export async function startCoordinator(cards: Card[]) {
  const { setNotice } = useStore.getState();
  const requests = startRequests(cards);
  const results = await Promise.allSettled(requests.map(({ repo, numbers }) => api.post(`/api/coordinator/start`, { repo, numbers })));
  const failed = requests.flatMap((r, i) => {
    const res = results[i]!;
    return res.status === "rejected" ? [{ repo: r.repo, error: res.reason instanceof Error ? res.reason.message : String(res.reason) }] : [];
  });
  const failedRepos = failed.map((f) => f.repo);
  const retry = cards.filter((c) => failedRepos.includes(c.repo));
  setNotice({ key: (retry[0] ?? cards[0]!).key, text: startNotice(requests.map((r) => r.repo).filter((r) => !failedRepos.includes(r)), failed), canStart: retry.length > 0, start: retry, failed: failed.length > 0 });
}
