// One panel per kind of Feedback (brief jobs 2-5, 10). Each writes what the workflow writes and Pushes
// unless the developer unticks Push for this piece of Feedback. Every panel is pick-then-send, by mouse and by keys:
// a click or a digit only picks, the Send button or ⌘↵ writes. An ask with options to pick from (one question or several) is
// `AskPanel` in `Questions.tsx`; here are the answer in words, the round in the older shape, the PR, the agent decisions and the Look. What was typed and picked is a draft in the store
// (per Card + request, `useDraft`): it survives Card switches and snapshots, goes when the send succeeded. What an answer is and how
// it is sent lives in `feedback/answers.ts`, shared with the covers of Focus (where a click on an option sends).
import { Fragment, useEffect, useRef, useState } from "react";
import { keyLabel, splitKey } from "../../core/axes.ts";
import { feedbackComment } from "../../core/answer.ts";
import { buildNav, shotGroups, type ShotGroup, type ShotNav } from "../../core/gallery.ts";
import type { Card, DesignRound, LookNote, Screenshot } from "../../core/types.ts";
import { AGENT_DRAFT_ID, draftKey } from "../../core/drafts.ts";
import { VERDICTS, useDecisionAnswer, usePrVerdict, useRoundReaction } from "../feedback/answers.ts";
import { useRegisterPanel, type PanelSpec } from "../feedback/panel.ts";
import { giveFeedback, useDraft, useStore } from "../store.ts";
import { Gallery, ShotImg, type Reaction } from "./Gallery.tsx";
import { keyOf } from "../keys.ts";
import { Writes } from "./Questions.tsx";
import { Btn, Ext, Inline, Markdown, ago, agoText } from "./bits.tsx";

/** The key cap of ⌘↵ inside every panel's Send button: the one way to send is always in view. */
const SendKey = () => <kbd aria-hidden>{keyOf("send-feedback")}</kbd>;

function PushToggle({ push, setPush }: { push: boolean; setPush: (p: boolean) => void }) {
  return (
    <label className="toggle" title="Tell the running coordinator right away">
      <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} data-testid="push-toggle" /> Push
    </label>
  );
}

/** Register this panel's number keys (`1`-`9`), ⌘↵ and its other actions for the window handler and the palette while it is mounted (and `on`). */
function usePanelKeys(cardKey: string, spec: PanelSpec, on = true) {
  useRegisterPanel(cardKey, spec, on);
}

const submitKeys = (e: React.KeyboardEvent, go: () => void) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    go();
  }
};

/** The top of a raised Feedback panel: the question as its heading, how long it has waited, and the links that open it elsewhere. */
function PanelHead({ question, id, since, children }: { question: string; id?: string; since: string | null; children?: React.ReactNode }) {
  return (
    <div className="panel-head">
      <div className="section-title">
        <Inline text={question} />
      </div>
      <div className="panel-meta">
        {id && <span className="did">{id}</span>}
        {since && (
          <span className="faint">waiting {ago(since)}</span>
        )}
        <span className="spacer" />
        {children}
      </div>
    </div>
  );
}

/** A request with nothing to pick from (an open question): answered in words. A request with options is `AskPanel` (`Questions.tsx`). */
export function DecisionPanel({ card }: { card: Card }) {
  const { req, text, push, edit, canSend, send, feedback } = useDecisionAnswer(card);
  usePanelKeys(card.key, { pick: () => {}, send: () => void send(), choices: [], canSend, push, setPush: (p) => edit({ push: p }) });
  if (!req) return null;
  const why = canSend ? null : "Write an answer";
  return (
    <div className="section waiting askp" data-testid="panel-decision">
      <PanelHead question={req.question} id={req.id} since={card.waiting?.since ?? null}>
        {req.preview && (
          <a href={req.preview} target="_blank" rel="noreferrer">
            Open preview
            <Ext />
          </a>
        )}
      </PanelHead>
      {req.recommendation && (
        <p className="qwhy" data-testid="why">
          <b>The agent says:</b> <Inline text={req.recommendation} />
        </p>
      )}
      <textarea className="input" aria-label="Your answer" placeholder="Your answer" value={text} onChange={(e) => edit({ text: e.target.value })} onKeyDown={(e) => submitKeys(e, () => void send())} />
      <div className="qsend" data-testid="send-row">
        <div className="qsend-what">
          <Writes card={card} comment={canSend && feedback ? feedbackComment(feedback) : null} why={why} />
        </div>
        <PushToggle push={push} setPush={(p) => edit({ push: p })} />
        <Btn className="btn primary" data-testid="send" why={why} onClick={() => void send()}>
          Send answer <SendKey />
        </Btn>
      </div>
    </div>
  );
}

/** `keys`: its digits and ⌘↵ are live (the Decided fold is open and no ask panel has them). */
export function AgentDecisionPanel({ card, keys }: { card: Card; keys: boolean }) {
  const pending = card.agentDecisions.filter((d) => card.decisionsToAccept.includes(d.id));
  // mode: "accept" (key 1), or the id of the decision being challenged (keys 2…), or nothing chosen yet
  const dKey = draftKey(card.key, AGENT_DRAFT_ID);
  const [{ mode: picked, text, push }, edit] = useDraft(dKey, { mode: null as string | null, text: "", push: true });
  const mode = picked === "accept" || pending.some((d) => d.id === picked) ? picked : null;
  const challenging = mode && mode !== "accept" ? mode : null;
  // the agent never waits on a decision: giving Feedback here does not make the Card "Awaiting pickup"
  const accept = async () => {
    if (await giveFeedback(card, "accept", { push }, { decisionsToAccept: [], labels: card.labels.filter((l) => l !== "agent-decided") })) useStore.getState().clearDraft(dKey);
  };
  const challenge = async () => {
    if (!challenging || !text.trim()) return;
    // the panel stays mounted while other decisions are new: forget this challenge at once so ⌘↵ cannot send it twice
    const [id, said] = [challenging, text];
    edit({ mode: null, text: "" });
    const sent = await giveFeedback(
      card,
      "challenge",
      { decisionId: id, text: said, push },
      { decisionsToAccept: card.decisionsToAccept.filter((x) => x !== id), agentDecisions: card.agentDecisions.map((d) => (d.id === id ? { ...d, challenge: said } : d)) },
    );
    // a failed send gives the challenge back, unless the developer started another one meanwhile
    const now = useStore.getState().drafts[dKey];
    if (!sent && !now?.mode && !now?.text) edit({ mode: id, text: said });
  };
  const canSend = mode === "accept" || (!!challenging && !!text.trim());
  const send = () => (challenging ? challenge() : mode === "accept" ? accept() : undefined);
  usePanelKeys(
    card.key,
    {
      pick: (n) => {
        const next = n === 1 ? "accept" : pending[n - 2]?.id;
        if (next) edit({ mode: mode === next ? null : next });
      },
      send: () => void send(),
      choices: [
        { n: 1, label: "Accept all agent decisions", on: mode === "accept" },
        ...pending.map((d, i) => ({ n: i + 2, label: `Challenge ${d.id}`, on: challenging === d.id })),
      ],
      canSend,
      push,
      setPush: (p) => edit({ push: p }),
    },
    keys,
  );
  return (
    <div className="section" data-testid="panel-agent-decision">
      <div className="section-title">
        New · {pending.length} <span className="muted">not blocking</span>
      </div>
      {pending.map((d, i) => (
        <div key={d.id} className="option" style={{ flexDirection: "column" }}>
          <Markdown text={d.body.replace(/<!--[\s\S]*?-->/g, "").replace(/\n---\n[\s\S]*$/, "")} breaks />
          <button
            className={`btn ghost ${challenging === d.id ? "selected" : ""}`}
            aria-pressed={challenging === d.id}
            onClick={() => edit({ mode: challenging === d.id ? null : d.id })}
          >
            Challenge {d.id} <kbd>{i + 2}</kbd>
          </button>
        </div>
      ))}
      {challenging && (
        <textarea
          className="input"
          autoFocus
          placeholder={`What should change about ${challenging}? (⌘↵)`}
          value={text}
          onChange={(e) => edit({ text: e.target.value })}
          onKeyDown={(e) => submitKeys(e, () => void challenge())}
        />
      )}
      <div className="actions">
        <PushToggle push={push} setPush={(p) => edit({ push: p })} />
        <span className="spacer" />
        <button className={`btn ${mode === "accept" ? "selected" : ""}`} aria-pressed={mode === "accept"} onClick={() => edit({ mode: mode === "accept" ? null : "accept" })}>
          Accept all <kbd>1</kbd>
        </button>
        <Btn
          className="btn primary"
          why={canSend ? null : challenging ? "Say what should change first" : "Accept all, or pick a decision to challenge"}
          onClick={() => void send()}
        >
          {challenging ? "Send challenge" : "Send"}
        </Btn>
      </div>
    </div>
  );
}

/** Which screenshot of one set is open in the gallery (null: closed). `signal` opens it from outside (palette). */
function useGallery(signal: number | undefined, count: number) {
  const [index, setIndex] = useState<number | null>(null);
  const seen = useRef(signal);
  useEffect(() => {
    if (signal === undefined || signal === seen.current) return;
    seen.current = signal;
    if (count) setIndex(0);
  }, [signal, count]);
  return { index, open: setIndex, close: () => setIndex(null) };
}

interface ShotSet {
  commentId: string;
  commentUrl: string;
  shots: Screenshot[];
}

export interface ShotSources {
  retry: (commentId: string) => Promise<boolean>;
  ensure: (commentId: string) => void;
}

/** Thumbnails grouped per variant (round) or state (Look); the index handed to `onOpen` is the gallery order. */
export function Thumbs({
  set,
  variants = [],
  by = "variant",
  src,
  onOpen,
}: {
  set: ShotSet;
  variants?: DesignRound["variants"];
  by?: "variant" | "state";
  src: ShotSources;
  onOpen: (i: number) => void;
}) {
  const nav = buildNav(set.shots, variants, by);
  if (!nav.flat.length) return <div className="muted">No screenshots in this round.</div>;
  return (
    <div className="thumb-groups">
      {nav.groups.map((g, gi) => (
        <div key={g.key ?? `none${gi}`} className="thumb-group" data-testid={`thumb-group-${g.key ?? "none"}`}>
          {g.title && <div className="thumb-group-title">{g.title}</div>}
          <ThumbRow nav={nav} group={g} set={set} src={src} onOpen={onOpen} />
        </div>
      ))}
    </div>
  );
}

/** The thumbnails of one group, desktop first. */
function ThumbRow({ nav, group, set, src, onOpen }: { nav: ShotNav; group: ShotGroup; set: ShotSet; src: ShotSources; onOpen: (i: number) => void }) {
  return (
    <div className="thumbs">
      {group.indices.map((i) => {
        const s = nav.flat[i]!;
        return (
          <button key={s.alt + i} className="thumb" onClick={() => (src.ensure(set.commentId), onOpen(i))} title={s.alt}>
            <ShotImg shot={s} commentUrl={set.commentUrl} onRetry={() => src.retry(set.commentId)} loading="lazy" />
            <span>{[s.viewport, s.state].filter(Boolean).join(" · ") || s.alt}</span>
          </button>
        );
      })}
    </div>
  );
}

const roundSet = (r: DesignRound): ShotSet => ({ commentId: r.commentId, commentUrl: r.url, shots: r.screenshots });

export function RoundPanel({ card, round, src, openSignal }: { card: Card; round: DesignRound; src: ShotSources; openSignal?: number }) {
  const { picks, rejects, text, push, edit, toggle, canSend, send } = useRoundReaction(card, round);
  const gallery = useGallery(openSignal, round.screenshots.length);
  usePanelKeys(card.key, {
    pick: (n) => {
      const v = round.variants[n - 1];
      if (v) toggle("picks", v.key);
    },
    send: () => void send(),
    choices: round.variants.map((v, i) => ({ n: i + 1, label: `Pick variant ${keyLabel(v.key)}`, on: picks.includes(v.key) })),
    extras: round.variants.map((v) => ({
      id: `reject-${v.key}`,
      label: `${rejects.includes(v.key) ? "Unreject" : "Reject"} variant ${keyLabel(v.key)}`,
      run: () => toggle("rejects", v.key),
    })),
    canSend,
    push,
    setPush: (p) => edit({ push: p }),
  });
  const reaction: Reaction = {
    picks,
    rejects,
    toggle: (list, k) => toggle(list === "pick" ? "picks" : "rejects", k),
    canSend,
    send: () => void send(),
  };
  const set = roundSet(round);
  // one block per variant: what it is, its screenshots and the two reactions, so nothing about a variant is read in two places
  const nav = buildNav(set.shots, round.variants, "variant");
  const declared = round.variants.map((v) => v.key);
  const loose = nav.groups.filter((g) => g.key === null || !declared.includes(g.key));
  return (
    <div className="section waiting" data-testid="panel-design-round">
      <PanelHead question={round.question || `Design round ${round.round}`} id={`R${round.round}`} since={card.waiting?.since ?? null}>
        {round.preview && (
          <a href={round.preview} target="_blank" rel="noreferrer">
            Open prototype
            <Ext />
          </a>
        )}
      </PanelHead>
      {!nav.flat.length && <div className="muted">No screenshots in this round.</div>}
      <div className="variants">
        {round.variants.map((v, i) => {
          const group = nav.groups.find((g) => g.key === v.key);
          const state = picks.includes(v.key) ? "picked" : rejects.includes(v.key) ? "rejected" : undefined;
          const option = splitKey(v.key).option;
          const axis = v.axis !== null && round.variants[i - 1]?.axis !== v.axis ? round.axes.find((a) => a.name === v.axis) : undefined;
          return (
            <Fragment key={v.key}>
              {axis && (
                <div className="variant-axis" data-testid={`axis-${axis.name}`}>
                  <b>{axis.name}</b>
                  {axis.about && <span className="faint">{axis.about}</span>}
                </div>
              )}
              <div className="variant" data-state={state} data-testid={`thumb-group-${v.key}`}>
                <div className="variant-head">
                  <kbd>{i + 1}</kbd>
                  <span className="variant-name">
                    <b>{option}</b>
                    {v.name && v.name !== option ? ` ${v.name}` : ""}
                  </span>
                  <span className="variant-sum faint" title={v.summary}>
                    {v.summary}
                  </span>
                  <button className={`btn ${picks.includes(v.key) ? "selected" : ""}`} aria-pressed={picks.includes(v.key)} aria-label={`Pick variant ${keyLabel(v.key)}`} onClick={() => toggle("picks", v.key)}>
                    Pick
                  </button>
                  <button className={`btn ${rejects.includes(v.key) ? "selected" : ""}`} aria-pressed={rejects.includes(v.key)} aria-label={`Reject variant ${keyLabel(v.key)}`} onClick={() => toggle("rejects", v.key)}>
                    Reject
                  </button>
                </div>
                {group && <ThumbRow nav={nav} group={group} set={set} src={src} onOpen={gallery.open} />}
              </div>
            </Fragment>
          );
        })}
        {loose.map((g, gi) => (
          <div key={g.key ?? `none${gi}`} className="thumb-group" data-testid={`thumb-group-${g.key ?? "none"}`}>
            {g.title && <div className="thumb-group-title">{g.title}</div>}
            <ThumbRow nav={nav} group={g} set={set} src={src} onOpen={gallery.open} />
          </div>
        ))}
      </div>
      <textarea
        className="input"
        placeholder='Comment, e.g. "header from a, list from b" (⌘↵)'
        value={text}
        onChange={(e) => edit({ text: e.target.value })}
        onKeyDown={(e) => submitKeys(e, () => void send())}
      />
      <div className="actions">
        <PushToggle push={push} setPush={(p) => edit({ push: p })} />
        <span className="spacer" />
        <Btn className="btn primary" why={canSend ? null : "Pick or reject a variant, or write a comment"} onClick={() => void send()}>
          Send reaction <SendKey />
        </Btn>
      </div>
      {gallery.index !== null && (
        <Gallery
          context={`R${round.round}`}
          shots={round.screenshots}
          variants={round.variants}
          by="variant"
          index={gallery.index}
          onIndex={gallery.open}
          onClose={gallery.close}
          commentUrl={round.url}
          onRetry={() => src.retry(round.commentId)}
          reaction={reaction}
        />
      )}
    </div>
  );
}

/** Rounds the developer can only read: earlier ones while a round waits, all of them otherwise. */
export function EarlierRounds({
  rounds,
  label,
  src,
  openSignal,
  startOpen = false,
}: {
  rounds: DesignRound[];
  label: string;
  src: ShotSources;
  openSignal?: number;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState<{ round: number; index: number } | null>(null);
  const [expanded, setExpanded] = useState(startOpen);
  const last = [...rounds].reverse().find((r) => r.screenshots.length);
  const seen = useRef(openSignal);
  useEffect(() => {
    if (openSignal === undefined || openSignal === seen.current) return;
    seen.current = openSignal;
    if (last) setOpen({ round: last.round, index: 0 });
  }, [openSignal, last]);
  const current = open && rounds.find((r) => r.round === open.round);
  if (!rounds.length) return null;
  return (
    <>
      <details data-testid="earlier-rounds" open={expanded} onToggle={(e) => setExpanded(e.currentTarget.open)}>
        <summary className="muted">
          {label} · {rounds.length}
        </summary>
        {rounds.map((r) => (
          <div key={r.round} data-testid={`round-${r.round}`}>
            <div className="thumb-group-title">
              <strong>R{r.round}</strong> {r.title.replace(/^Design round \d+:?\s*/, "")}
            </div>
            <Thumbs set={roundSet(r)} variants={shotGroups(r)} src={src} onOpen={(index) => setOpen({ round: r.round, index })} />
          </div>
        ))}
      </details>
      {open && current && (
        <Gallery
          context={`R${current.round}`}
          shots={current.screenshots}
          variants={shotGroups(current)}
          by="variant"
          index={open.index}
          onIndex={(index) => setOpen({ round: current.round, index })}
          onClose={() => setOpen(null)}
          commentUrl={current.url}
          onRetry={() => src.retry(current.commentId)}
        />
      )}
    </>
  );
}

export function PrPanel({ card }: { card: Card }) {
  const pr = card.pullRequest!;
  // a click or a digit only picks; Send (or ⌘↵) writes. Send back needs the note.
  const { chosen, text, push, edit, canSend, send } = usePrVerdict(card);
  const pick = (v: "approve" | "hold" | "send-back") => edit({ chosen: chosen === v ? null : v });
  usePanelKeys(card.key, {
    pick: (n) => {
      const v = VERDICTS[n - 1]?.[0];
      if (v) pick(v);
    },
    send: () => void send(),
    choices: [
      { n: 1, label: "Approve the PR", on: chosen === "approve" },
      { n: 2, label: "Hold the merge", on: chosen === "hold" },
      { n: 3, label: "Send the PR back", on: chosen === "send-back" },
    ],
    canSend,
    push,
    setPush: (p) => edit({ push: p }),
  });
  const req = card.requests.find((r) => r.id === card.waiting?.requestId);
  return (
    <div className="section waiting" data-testid="panel-pr-approval">
      <PanelHead question={req?.question ?? `PR #${pr.number} awaits approval`} id={`PR #${pr.number}`} since={card.waiting?.since ?? null}>
        <a href={`${pr.url}/files`} target="_blank" rel="noreferrer">
          Diff on GitHub
          <Ext />
        </a>
      </PanelHead>
      <details open>
        <summary className="muted">Summary, verification and review</summary>
        <Markdown text={pr.body} />
      </details>
      <div className="options" role="group" aria-label="Verdict">
        {VERDICTS.map(([v, label, what], i) => (
          <button key={v} className={`option ${chosen === v ? "selected" : ""}`} aria-pressed={chosen === v} onClick={() => pick(v)}>
            <kbd>{i + 1}</kbd>
            <span className="option-text">
              <b>{label}</b>
              <span className="muted">{what}</span>
            </span>
          </button>
        ))}
      </div>
      <textarea
        className="input"
        placeholder="Note (required to send back, ⌘↵ to send)"
        value={text}
        onChange={(e) => edit({ text: e.target.value })}
        onKeyDown={(e) => submitKeys(e, () => void send())}
      />
      <div className="actions">
        <PushToggle push={push} setPush={(p) => edit({ push: p })} />
        <span className="spacer" />
        <Btn className="btn primary" why={canSend ? null : !chosen ? "Pick Approve, Hold merge or Send back first" : "Send back needs a note"} onClick={() => void send()}>
          Send <SendKey />
        </Btn>
      </div>
    </div>
  );
}

export function LookPanel({ card, look, src, openSignal }: { card: Card; look: LookNote | null; src: ShotSources; openSignal?: number }) {
  const gallery = useGallery(openSignal, look?.screenshots.length ?? 0);
  const seen = !!card.seenAt;
  return (
    <div className={`section ${seen ? "" : "waiting"}`} data-testid="panel-look">
      <div className="panel-head">
        <div className="section-title">{look ? look.headline : "Look"}</div>
        <div className="panel-meta">
          <span className="faint">{card.closedAt ? `Done ${agoText(card.closedAt)}` : "Done"}</span>
          <span className="spacer" />
          {look?.preview && (
            <a href={look.preview} target="_blank" rel="noreferrer">
              Open preview
              <Ext />
            </a>
          )}
        </div>
      </div>
      {!look && <div className="muted">No Look comment on this issue.</div>}
      {look?.checks.length ? (
        <ul className="checks">
          {look.checks.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      ) : null}
      {look && <Thumbs set={{ commentId: look.commentId, commentUrl: look.url, shots: look.screenshots }} by="state" src={src} onOpen={gallery.open} />}
      {look && gallery.index !== null && (
        <Gallery
          context="Look"
          shots={look.screenshots}
          variants={[]}
          by="state"
          index={gallery.index}
          onIndex={gallery.open}
          onClose={gallery.close}
          commentUrl={look.url}
          onRetry={() => src.retry(look.commentId)}
        />
      )}
    </div>
  );
}
