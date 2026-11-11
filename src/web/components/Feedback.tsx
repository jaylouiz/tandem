// One panel per kind of Feedback (brief jobs 2-5, 10). Each writes what the workflow writes and Pushes
// unless the developer unticks Push for this piece of Feedback. Every panel is pick-then-send, by mouse and by keys:
// a click or a digit only picks, the Send button or ⌘↵ writes. What was typed and picked is a draft in the store
// (per Card + request, `useDraft`): it survives Card switches and snapshots, goes when the send succeeded.
import { useEffect, useRef, useState } from "react";
import { buildNav, type ShotGroup, type ShotNav } from "../../core/gallery.ts";
import type { Card, DesignRound, LookNote, Screenshot } from "../../core/types.ts";
import { AGENT_DRAFT_ID, draftKey, prDraftId, roundDraftId } from "../../core/drafts.ts";
import { panelKeys, type PanelChoice, type PanelExtra, type PanelKeys } from "../panelKeys.ts";
import { giveFeedback, useDraft, useStore, type Tab } from "../store.ts";
import { Gallery, ShotImg, type Reaction } from "./Gallery.tsx";
import { keyOf } from "../keys.ts";
import { Btn, Ext, Markdown, ago } from "./bits.tsx";

/** The key cap of ⌘↵ inside every panel's Send button: the one way to send is always in view. */
const SendKey = () => <kbd aria-hidden>{keyOf("send-feedback")}</kbd>;

const done: Partial<Card> = { waiting: null, awaitingPickup: true };

function PushToggle({ push, setPush }: { push: boolean; setPush: (p: boolean) => void }) {
  return (
    <label className="toggle" title="Tell the running coordinator right away">
      <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} data-testid="push-toggle" /> Push
    </label>
  );
}

/** What a panel tells the keys and the palette about itself. */
interface PanelSpec {
  pick: (n: number) => void;
  send: () => void;
  choices: PanelChoice[];
  canSend: boolean;
  /** buttons without a key besides Push (Reject a variant) */
  extras?: PanelExtra[];
  push: boolean;
  setPush: (p: boolean) => void;
}

/** Register this panel's number keys (`1`-`9`), ⌘↵ and its other actions for the window handler and the palette while it is mounted and its tab is open. */
function usePanelKeys(cardKey: string, spec: PanelSpec, tabId: Tab = "now") {
  const latest = useRef(spec);
  latest.current = spec;
  const open = useStore((s) => s.tab === tabId);
  useEffect(() => {
    if (!open) return;
    const keys: PanelKeys = {
      cardKey,
      pick: (n) => latest.current.pick(n),
      send: () => latest.current.send(),
      choices: () => latest.current.choices,
      extras: () => [
        ...(latest.current.extras ?? []),
        { id: "push", label: latest.current.push ? "Push this Feedback: turn off" : "Push this Feedback: turn on", run: () => latest.current.setPush(!latest.current.push) },
      ],
      canSend: () => latest.current.canSend,
    };
    panelKeys.current = keys;
    return () => {
      if (panelKeys.current === keys) panelKeys.current = null;
    };
  }, [cardKey, open]);
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
      <div className="section-title">{question}</div>
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

export function DecisionPanel({ card }: { card: Card }) {
  const req = card.requests.find((r) => r.id === card.waiting?.requestId);
  const dKey = draftKey(card.key, req?.id ?? "");
  const [{ choice, text, push }, edit] = useDraft(dKey, { choice: null as string | null, text: "", push: true });
  const answer = [choice?.split(":")[0]?.trim(), text.trim()].filter(Boolean).join(". ");
  const send = async () => {
    if (!req || !answer) return;
    if (await giveFeedback(card, "answer", { requestId: req.id, answer, push }, done)) useStore.getState().clearDraft(dKey);
  };
  const clip = (o: string) => (o.length > 60 ? `${o.slice(0, 59)}…` : o);
  usePanelKeys(card.key, {
    pick: (n) => {
      const opt = req?.options[n - 1];
      if (opt) edit({ choice: choice === opt ? null : opt });
    },
    send: () => void send(),
    choices: (req?.options ?? []).map((o, i) => ({ n: i + 1, label: `Choose ${clip(o)}`, on: choice === o })),
    canSend: !!answer,
    push,
    setPush: (p) => edit({ push: p }),
  });
  if (!req) return null;
  const recommended = (opt: string) => !!req.recommendation && opt.split(":")[0]!.trim().toLowerCase() === req.recommendation.split(/[\s(]/)[0]!.toLowerCase();
  return (
    <div className="section waiting" data-testid="panel-decision">
      <PanelHead question={req.question} id={req.id} since={card.waiting?.since ?? null}>
        {req.preview && (
          <a href={req.preview} target="_blank" rel="noreferrer">
            Open preview
            <Ext />
          </a>
        )}
      </PanelHead>
      {req.options.length > 0 && (
        <div className="options" role="group" aria-label="Options">
          {req.options.map((o, i) => (
            <button key={o} className={`option ${choice === o ? "selected" : ""} ${recommended(o) ? "recommended" : ""}`} aria-pressed={choice === o} onClick={() => edit({ choice: choice === o ? null : o })}>
              <kbd>{i + 1}</kbd>
              <span className="option-text">{o}</span>
              {recommended(o) && <span className="option-rec">Recommended</span>}
            </button>
          ))}
        </div>
      )}
      {req.recommendation && <div className="muted">The agent recommends {req.recommendation}</div>}
      <textarea
        className="input"
        placeholder="Answer or add a note (⌘↵ to send)"
        value={text}
        onChange={(e) => edit({ text: e.target.value })}
        onKeyDown={(e) => submitKeys(e, send)}
      />
      <div className="actions">
        <PushToggle push={push} setPush={(p) => edit({ push: p })} />
        <span className="spacer" />
        <Btn className="btn primary" why={answer ? null : req.options.length ? "Pick an option or write an answer" : "Write an answer"} onClick={send}>
          Answer <SendKey />
        </Btn>
      </div>
    </div>
  );
}

export function AgentDecisionPanel({ card }: { card: Card }) {
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
    "decided",
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
  const dKey = draftKey(card.key, roundDraftId(round.round));
  const [{ picks, rejects, text, push }, edit] = useDraft(dKey, { picks: [] as string[], rejects: [] as string[], text: "", push: true });
  const gallery = useGallery(openSignal, round.screenshots.length);
  const toggle = (list: string[], field: "picks" | "rejects", k: string) => edit({ [field]: list.includes(k) ? list.filter((x) => x !== k) : [...list, k] });
  const canSend = !!(picks.length || rejects.length || text.trim());
  const send = async () => {
    if (canSend && (await giveFeedback(card, "round", { round: round.round, picks, rejects, comment: text, push }, done))) useStore.getState().clearDraft(dKey);
  };
  usePanelKeys(card.key, {
    pick: (n) => {
      const v = round.variants[n - 1];
      if (v) toggle(picks, "picks", v.key);
    },
    send: () => void send(),
    choices: round.variants.map((v, i) => ({ n: i + 1, label: `Pick variant ${v.key}`, on: picks.includes(v.key) })),
    extras: round.variants.map((v) => ({
      id: `reject-${v.key}`,
      label: `${rejects.includes(v.key) ? "Unreject" : "Reject"} variant ${v.key}`,
      run: () => toggle(rejects, "rejects", v.key),
    })),
    canSend,
    push,
    setPush: (p) => edit({ push: p }),
  });
  const reaction: Reaction = {
    picks,
    rejects,
    toggle: (list, k) => (list === "pick" ? toggle(picks, "picks", k) : toggle(rejects, "rejects", k)),
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
          return (
            <div key={v.key} className="variant" data-state={state} data-testid={`thumb-group-${v.key}`}>
              <div className="variant-head">
                <kbd>{i + 1}</kbd>
                <span className="variant-name">
                  <b>{v.key}</b>
                  {v.name && v.name !== v.key ? ` ${v.name}` : ""}
                </span>
                <span className="variant-sum faint" title={v.summary}>
                  {v.summary}
                </span>
                <button className={`btn ${picks.includes(v.key) ? "selected" : ""}`} aria-pressed={picks.includes(v.key)} aria-label={`Pick variant ${v.key}`} onClick={() => toggle(picks, "picks", v.key)}>
                  Pick
                </button>
                <button className={`btn ${rejects.includes(v.key) ? "selected" : ""}`} aria-pressed={rejects.includes(v.key)} aria-label={`Reject variant ${v.key}`} onClick={() => toggle(rejects, "rejects", v.key)}>
                  Reject
                </button>
              </div>
              {group && <ThumbRow nav={nav} group={group} set={set} src={src} onOpen={gallery.open} />}
            </div>
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
            <Thumbs set={roundSet(r)} variants={r.variants} src={src} onOpen={(index) => setOpen({ round: r.round, index })} />
          </div>
        ))}
      </details>
      {open && current && (
        <Gallery
          context={`R${current.round}`}
          shots={current.screenshots}
          variants={current.variants}
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

/** The three verdicts in key order, each with what it sets off (`prVerdictComment`; Hold also labels the issue do-not-merge). */
const VERDICTS: ["approve" | "hold" | "send-back", string, string][] = [
  ["approve", "Approve", "The agent may merge"],
  ["hold", "Hold merge", "The PR stays open and is labelled do-not-merge"],
  ["send-back", "Send back", "Back to the agent, with your note"],
];

export function PrPanel({ card }: { card: Card }) {
  const pr = card.pullRequest!;
  const dKey = draftKey(card.key, prDraftId(card.waiting?.requestId ?? null));
  const [{ chosen, text, push }, edit] = useDraft(dKey, { chosen: null as "approve" | "hold" | "send-back" | null, text: "", push: true });
  // a click or a digit only picks; Send (or ⌘↵) writes. Send back needs the note.
  const canSend = !!chosen && (chosen !== "send-back" || !!text.trim());
  const send = async () => {
    if (!chosen || !canSend) return;
    if (await giveFeedback(card, "pr", { verdict: chosen, text, requestId: card.waiting?.requestId ?? null, push }, chosen === "hold" ? { ...done, onHold: true } : done))
      useStore.getState().clearDraft(dKey);
  };
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
          <span className="faint">{card.closedAt ? `Done ${ago(card.closedAt)} ago` : "Done"}</span>
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
