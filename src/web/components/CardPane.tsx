import { useEffect, useRef, useState } from "react";
import { STATE_DEFAULT_TEXT, STATE_LABEL, classifyActivity, parseLog, type Activity } from "../../core/activity.ts";
import { KIND_LABEL, askOf, decisionState, kindOf, sinceOf } from "../../core/ask.ts";
import type { Card, DesignRound } from "../../core/types.ts";
import type { ShotsTarget } from "../../core/gallery.ts";
import { NO_COORDINATORS, TABS, api, useActivity, useCard, useNow, useStore } from "../store.ts";
import { useSigned } from "../signed.ts";
import { markSeen } from "../seen.ts";
import { handedValid, startNotice, startRequests } from "../../core/triage.ts";
import { TRIAGE_ENTRIES, actionBlocked, runTriage } from "../triage.ts";
import { BINDINGS, keyCaps, keyOf } from "../keys.ts";
import { AgentDecisionPanel, DecisionPanel, EarlierRounds, LookPanel, PrPanel, RoundPanel } from "./Feedback.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import { ActDot, Age, Btn, CardChips, Ext, KindGlyph, Markdown, RepoTag, Stepper, ago } from "./bits.tsx";


function Triage({ card }: { card: Card }) {
  const handed = useStore((s) => s.handed);
  const hold = useStore((s) => s.board?.workflow.holdLabel ?? "on-hold");
  const entry = (id: string) => TRIAGE_ENTRIES.find((e) => e.id === id)!;
  const heldByWorkflow = card.onHold && !card.labels.includes(hold);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(`/wayfinder ${card.number}`);
    setCopied(true);
  };
  return (
    <div data-testid="triage">
      {card.fog ? (
        <div className="actions" data-testid="fog-hint">
          <span className="muted">
            Needs wayfinder: run <code>/wayfinder {card.number}</code> in a terminal
          </span>
          <button className="btn" onClick={copy} aria-label={`Copy /wayfinder ${card.number}`}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : (
        <div className="actions">
          <span className="muted">Next step</span>
          {TRIAGE_ENTRIES.filter((e) => e.action.kind === "next").map((e) => (
            <Btn
              key={e.id}
              className={`btn ${e.action.kind === "next" && card.nextStep === e.action.step ? "selected" : ""}`}
              why={actionBlocked(e.action, [card], handed)}
              title={`${e.label} (${e.key})`}
              onClick={() => void runTriage(e, [card])}
            >
              {e.action.kind === "next" ? e.action.step : ""} <kbd>{e.key}</kbd>
            </Btn>
          ))}
        </div>
      )}
      <div className="actions">
        <span className="muted">Priority</span>
        {TRIAGE_ENTRIES.filter((e) => e.action.kind === "priority" && e.action.level > 0).map((e) => (
          <button
            key={e.id}
            className={`btn ${e.action.kind === "priority" && card.priority === e.action.level ? "selected" : ""}`}
            title={`${e.label} (${e.key})`}
            onClick={() => void runTriage(e, [card])}
          >
            P{e.action.kind === "priority" ? e.action.level : ""} <kbd>{e.key}</kbd>
          </button>
        ))}
        {card.priority !== null && (
          <button className="btn ghost" title="Priority: clear (0)" onClick={() => void runTriage(entry("priority-0"), [card])}>
            Clear <kbd>0</kbd>
          </button>
        )}
        <span className="spacer" />
        {card.phase === "Inbox" && (
          <button className={`btn ${card.fog ? "selected" : ""}`} onClick={() => void runTriage(entry("fog"), [card])}>
            Needs wayfinder <kbd>w</kbd>
          </button>
        )}
        <Btn
          className="btn"
          why={heldByWorkflow ? "On hold through a workflow label; remove that label on GitHub to release it" : actionBlocked({ kind: "hold" }, [card], handed)}
          onClick={() => void runTriage(entry("hold"), [card])}
        >
          {heldByWorkflow ? "On hold" : card.labels.includes(hold) ? "Release hold" : "Hold Card"} <kbd>h</kbd>
        </Btn>
      </div>
    </div>
  );
}

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

const clock = (iso: string) => {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${time}`;
};

function useActivityOf(card: Card | null): Activity | null {
  const activity = useActivity();
  const cfg = useStore((s) => s.board?.workflow);
  const now = useNow();
  return card && cfg ? classifyActivity(card, activity[card.key], now, cfg) : null;
}

/** Where the Card is: state, when it last moved, and the coordination log on demand. */
function Status({ card, act, expanded }: { card: Card; act: Activity | null; expanded: boolean }) {
  const [shown, setShown] = useState(expanded);
  const log = useLog(card, shown);
  const lines = log ? parseLog(log) : [];
  return (
    <div className="section tight" data-testid="status">
      <div className="status-line" data-state={act?.state}>
        {act && <ActDot state={act.state} />}
        <b>{act ? STATE_LABEL[act.state] : "Status"}</b>
        <span className="muted">last moved {ago(act?.at ?? card.updatedAt)} ago</span>
      </div>
      {act && <div className="status-last muted">{act.last ?? STATE_DEFAULT_TEXT[act.state]}</div>}
      {expanded ? null : (
        <button className="btn ghost" aria-expanded={shown} onClick={() => setShown(!shown)}>
          {shown ? "Hide coordination log" : "Show coordination log"}
        </button>
      )}
      {shown && (
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
      )}
    </div>
  );
}

function Decided({ card, rounds, roundWaits, src, signal }: { card: Card; rounds: DesignRound[]; roundWaits: boolean; src: ReturnType<typeof useSigned>; signal: number | undefined }) {
  const answered = card.requests.filter((r) => r.answer !== null || r.resolved);
  const earlier = roundWaits ? rounds.slice(0, -1) : rounds;
  const nothing = !answered.length && !card.agentDecisions.length && !earlier.length;
  return (
    <div className="decided" data-testid="decided">
      {nothing && <div className="empty tight">Nothing decided yet.</div>}
      {answered.length > 0 && (
        <>
          <div className="sec-h">Your answers</div>
          {answered.map((r) => (
            <div key={r.id} className="decided-row">
              <span className="did">{r.id}</span>
              <div className="decided-body">
                <span>{r.question}</span>
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
          {card.decisionsToAccept.length > 0 && <AgentDecisionPanel card={card} />}
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
      {earlier.length > 0 && (
        <>
          <EarlierRounds key={`earlier-${card.key}`} rounds={earlier} label={roundWaits ? "Earlier rounds" : "Design rounds"} src={src} openSignal={signal} startOpen />
        </>
      )}
    </div>
  );
}

/** `focus`: the Card as the one sheet of Focus (Waiting on me, one at a time): the ask and its tabs, without triage and status. */
export function CardPane({ cardKey, mode }: { cardKey: string; mode: "split" | "aside" | "focus" }) {
  const card = useCard(cardKey);
  const select = useStore((s) => s.select);
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const failure = useStore((s) => s.failures[cardKey]);
  const clearFailure = useStore((s) => s.clearFailure);
  const coordinators = useStore((s) => s.board?.coordinators ?? NO_COORDINATORS);
  const shotsRequest = useStore((s) => s.shotsRequest);
  const act = useActivityOf(card);
  const signed = useSigned(card);
  const handed = useStore((s) => s.handed);
  const handedRec = handed[cardKey];
  const handedRef = useRef<HTMLSpanElement>(null);
  const handBtnRef = useRef<HTMLButtonElement>(null);
  /** the Card whose Hand button (or handed text) holds the keyboard */
  const refocus = useRef<string | null>(null);
  const isHanded = !!card && handedValid(card, handedRec);
  // the Hand button and the handed text swap places: keep the keyboard where it was (also when a failed Push or a hold swaps them back)
  useEffect(() => {
    const mine = refocus.current === cardKey;
    if (isHanded && mine) handedRef.current?.focus();
    else if (!isHanded && mine && document.activeElement === document.body) handBtnRef.current?.focus();
    refocus.current = isHanded && document.activeElement === handedRef.current ? cardKey : null;
  }, [isHanded, cardKey]);
  // Closing the aside (its Close button, Esc, a click on empty space) hands focus back to the Card or row that opened it (#42). Only when focus
  // was lost with the pane (it sits on `body` now): another Card selected, a view or a dialog opened, or focus put elsewhere keep theirs.
  useEffect(
    () => () => {
      if (mode === "aside" && useStore.getState().selected === null && (!document.activeElement || document.activeElement === document.body))
        document.querySelector<HTMLElement>(`.card[data-card="${cardKey}"], .qrow[data-card="${cardKey}"]`)?.focus();
    },
    [mode, cardKey],
  );
  // the palette's "Open screenshots" names a panel: show the tab that holds it
  useEffect(() => {
    if (shotsRequest?.key === cardKey) setTab(shotsRequest.target === "earlier" ? "decided" : "now");
  }, [shotsRequest, cardKey, setTab]);
  if (!card) return null;
  const running = !!coordinators[card.repo];
  // screenshots with their signed sources (private repos), see signed.ts
  const rounds = card.rounds.map((r) => ({ ...r, screenshots: signed.shots(r.commentId, r.screenshots) }));
  const look = card.look ? { ...card.look, screenshots: signed.shots(card.look.commentId, card.look.screenshots) } : null;
  const round = rounds.at(-1);
  const roundWaits = card.waiting?.kind === "design-round" && !!round;
  const lookShown = card.phase === "Done" && card.needsLook;
  // a Card that changes afterwards (Send moves the round to "earlier") never re-targets the panel
  const signalFor = (who: ShotsTarget) => (shotsRequest?.key === card.key && shotsRequest.target === who ? shotsRequest.id : undefined);
  const kind = kindOf(card);
  const focus = mode === "focus";
  // the Feedback panels lead with their own question: only an ask without a panel (Awaiting pickup) is spelled out in the head
  const headAsk = kind === "pickup";

  return (
    <aside className={`pane ${mode}`} data-testid="detail" aria-label={`Card ${card.key}`}>
      <div className="pane-head">
        <div className="pane-top">
          <Stepper phase={card.phase} />
          <span style={{ flex: 1 }} />
          <a className="btn ghost" href={card.url} target="_blank" rel="noreferrer">
            GitHub<Ext />
          </a>
          {mode === "aside" && (
            <Tooltip label="Close the Card" keys={keyOf("escape")} side="bottom">
              <button className="btn ghost" onClick={() => select(null)} aria-label="Close">
                <kbd>{keyOf("escape")}</kbd>
              </button>
            </Tooltip>
          )}
        </div>
        <h2>{card.title}</h2>
        <div className="actions">
          <RepoTag repo={card.repo} number={card.number} />
          <CardChips card={card} />
        </div>
        {kind && headAsk && (
          <div className="pane-ask" data-kind={kind}>
            <KindGlyph kind={kind} box />
            <div>
              <div className="ask-kind">{KIND_LABEL[kind]}</div>
              <div className="ask-text">{askOf(card)}</div>
            </div>
            <Age iso={sinceOf(card)} />
          </div>
        )}
        <div className="tabs" role="tablist" aria-label="Card">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
          <span className="tabs-hint faint">
            {keyCaps(BINDINGS.find((b) => b.id === "tab")!).map((c) => (
              <kbd key={c}>{c}</kbd>
            ))}
          </span>
        </div>
      </div>
      <div className="pane-body">
        <div className="tab-body" role="tabpanel" hidden={tab !== "now"} data-testid="tab-now">
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
          {card.waiting?.kind === "decision" && <DecisionPanel key={card.waiting.requestId} card={card} />}
          {card.decisionsToAccept.length > 0 && (
            <button className="quiet-line" data-testid="decisions-line" onClick={() => setTab("decided")}>
              {card.decisionsToAccept.length} agent decision{card.decisionsToAccept.length > 1 ? "s" : ""}, not blocking <kbd>{keyCaps(BINDINGS.find((b) => b.id === "tab")!)[1]}</kbd>
            </button>
          )}
          {roundWaits && round && <RoundPanel key={`${card.key}-${round.round}`} card={card} round={round} src={signed} openSignal={signalFor("round")} />}
          {card.waiting?.kind === "pr-approval" && card.pullRequest && <PrPanel card={card} />}
          {lookShown && <LookPanel key={`look-${card.key}`} card={card} look={look} src={signed} openSignal={signalFor("look")} />}
          {/* Focus shows a Look without marking it: Seen is the developer's own reaction here, and it moves on to the next Card */}
          {lookShown && focus && !card.seenAt && (
            <div className="actions">
              <span className="spacer" />
              <button className="btn primary" data-testid="focus-seen" onClick={() => void markSeen([card], true, { quiet: true })}>
                Mark Seen <kbd>{keyOf("seen")}</kbd>
              </button>
            </div>
          )}

          {card.awaitingPickup && (
            <div className="section" data-testid="awaiting-pickup">
              <div className="section-title">Feedback given, awaiting pickup</div>
              {running ? (
                <div className="muted">The coordinator for {card.repo} is running and will resume this Card.</div>
              ) : (
                <div className="actions">
                  <span className="muted">No coordinator is running for {card.repo}.</span>
                  <span className="spacer" />
                  <button className="btn primary" onClick={() => void startCoordinator([card])}>
                    Start coordinator
                  </button>
                </div>
              )}
            </div>
          )}

          {card.phase !== "Done" && !focus && (
            <div className="section">
              <Triage key={card.key} card={card} />
              {card.phase === "Backlog" && !card.waiting && (
                <div className="actions">
                  <span className="muted">{running ? "Coordinator running" : "No coordinator running"}</span>
                  <span className="spacer" />
                  {handedValid(card, handedRec) ? (
                    <span className="handed" data-testid="handed" tabIndex={-1} ref={handedRef}>
                      <span>
                        Handed to the coordinator · {handedRec.nextStep} · {clock(new Date(handedRec.at).toISOString())}
                      </span>
                      <span className="muted">Hold and release to hand again</span>
                    </span>
                  ) : (
                    <Btn
                      ref={handBtnRef}
                      className="btn primary"
                      onClick={() => {
                        refocus.current = card.key;
                        void runTriage(TRIAGE_ENTRIES.find((e) => e.id === "hand")!, [card]);
                      }}
                      why={actionBlocked({ kind: "hand" }, [card], handed)}
                    >
                      Hand to agent ({card.nextStep ?? "set a Next step"}) <kbd>a</kbd>
                    </Btn>
                  )}
                </div>
              )}
            </div>
          )}
          {!focus && <Status key={`status-${card.key}`} card={card} act={act} expanded={false} />}
        </div>
        <div className="tab-body" role="tabpanel" hidden={tab !== "decided"} data-testid="tab-decided">
          <Decided card={card} rounds={rounds} roundWaits={roundWaits} src={signed} signal={signalFor("earlier")} />
        </div>
        {tab === "activity" && (
          <div className="tab-body" role="tabpanel" data-testid="tab-activity">
            <Status key={`activity-${card.key}`} card={card} act={act} expanded />
          </div>
        )}
        {tab === "issue" && (
          <div className="tab-body" role="tabpanel" data-testid="tab-issue">
            <Markdown text={card.body || "_No description._"} />
          </div>
        )}
      </div>
    </aside>
  );
}

/** Start a coordinator per repo for these Cards, all repos at once (a Card's own button passes one Card). It starts with their numbers, so they count as handed; repos that failed stay on the toast for a retry. */
export async function startCoordinator(cards: Card[]) {
  const { setNotice, markHanded } = useStore.getState();
  const requests = startRequests(cards);
  const results = await Promise.allSettled(requests.map(({ repo, numbers }) => api.post(`/api/coordinator/start`, { repo, numbers })));
  const failed = requests.flatMap((r, i) => {
    const res = results[i]!;
    return res.status === "rejected" ? [{ repo: r.repo, error: res.reason instanceof Error ? res.reason.message : String(res.reason) }] : [];
  });
  const failedRepos = failed.map((f) => f.repo);
  markHanded(cards.filter((c) => !failedRepos.includes(c.repo)));
  const retry = cards.filter((c) => failedRepos.includes(c.repo));
  setNotice({ key: (retry[0] ?? cards[0]!).key, text: startNotice(requests.map((r) => r.repo).filter((r) => !failedRepos.includes(r)), failed), canStart: retry.length > 0, start: retry, failed: failed.length > 0 });
}
