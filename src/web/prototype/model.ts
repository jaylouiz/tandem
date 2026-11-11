// PROTOTYPE (issue #8, never merged): the shared model of the three Feedback-path variants. Nothing here writes anywhere:
// picks and sends live in this module's own store, and a "send" is a timer. The comment shown as "what gets written" comes
// from the real builders in core/contract.ts, so it is the exact text Tandem would write.
import { create } from "zustand";
import { answerComment, prVerdictComment, roundReactionComment, type PrVerdict } from "../../core/contract.ts";
import { kindOf } from "../../core/ask.ts";
import type { Card, DecisionRequest, DesignRound, LookNote } from "../../core/types.ts";
import { focusQueue } from "../store.ts";

export type VariantKey = "a" | "b" | "c";
export type ProtoState = "session" | "back" | "empty" | "done";
export type AskKind = "decision" | "design-round" | "pr-approval" | "look";

export const VARIANTS: { key: VariantKey; name: string; line: string }[] = [
  { key: "a", name: "Covers", line: "One ask per screen, composed for its kind" },
  { key: "b", name: "Run", line: "One key per Card, one Send for the run" },
  { key: "c", name: "Desk", line: "Queue, evidence and answer side by side" },
];
export const STATES: { key: ProtoState; name: string }[] = [
  { key: "session", name: "9 waiting" },
  { key: "back", name: "3 new" },
  { key: "done", name: "Finished" },
  { key: "empty", name: "Empty" },
];

export interface Draft {
  choice: string | null; // a decision's option, raw
  picks: string[];
  rejects: string[];
  verdict: PrVerdict | null;
  note: string;
  noteOpen: boolean;
  push: boolean;
}
export const EMPTY: Draft = { choice: null, picks: [], rejects: [], verdict: null, note: "", noteOpen: false, push: true };

export type Status = "sending" | "sent" | "failed" | "seen";

interface Params {
  variant: VariantKey;
  state: ProtoState;
  fail: boolean;
  at: string | null;
}

export function readParams(): Params | null {
  const q = new URLSearchParams(location.search);
  const v = q.get("variant");
  if (!v) return null;
  const state = q.get("state") as ProtoState | null;
  return {
    variant: (["a", "b", "c"] as const).includes(v as VariantKey) ? (v as VariantKey) : "a",
    state: state && STATES.some((s) => s.key === state) ? state : "session",
    fail: q.get("fail") === "1",
    at: q.get("at"),
  };
}

/** The query parameters that belong to the prototype: the app's own URL sync keeps them (routing.ts). */
export const PROTO_PARAMS = ["variant", "state", "fail", "at", "theme"];

interface Proto extends Params {
  on: boolean;
  drafts: Record<string, Draft>;
  status: Record<string, Status>;
  /** Cards whose first send already failed once: the retry goes through */
  failedOnce: Record<string, true>;
  /** the open Card */
  current: string | null;
  /** A's start cover and B/C's "since you left" marker are passed once the developer starts */
  started: boolean;
  set: (p: Partial<Params>) => void;
  edit: (key: string, patch: Partial<Draft>) => void;
  clear: (key: string) => void;
  open: (key: string | null) => void;
  start: () => void;
  mark: (key: string, s: Status | null) => void;
}

const initial = readParams();

function writeUrl(p: Params) {
  const q = new URLSearchParams(location.search);
  q.set("variant", p.variant);
  if (p.state === "session") q.delete("state");
  else q.set("state", p.state);
  if (p.fail) q.set("fail", "1");
  else q.delete("fail");
  q.delete("at");
  history.replaceState(null, "", `${location.pathname}?${q}`);
}

export const useProto = create<Proto>((set, get) => ({
  on: !!initial,
  variant: initial?.variant ?? "a",
  state: initial?.state ?? "session",
  fail: initial?.fail ?? false,
  at: initial?.at ?? null,
  drafts: {},
  status: {},
  failedOnce: {},
  current: null,
  started: !!initial?.at,
  set: (p) => {
    const next = { variant: get().variant, state: get().state, fail: get().fail, at: null, ...p };
    writeUrl(next);
    // a new variant or state starts a fresh session; the fail switch only arms the next send
    const fresh = p.variant !== undefined || p.state !== undefined;
    set(fresh ? { ...next, drafts: {}, status: {}, failedOnce: {}, current: null, started: false } : next);
  },
  edit: (key, patch) => set((s) => ({ drafts: { ...s.drafts, [key]: { ...(s.drafts[key] ?? EMPTY), ...patch } } })),
  clear: (key) =>
    set((s) => {
      const { [key]: _, ...rest } = s.drafts;
      return { drafts: rest };
    }),
  open: (key) => set({ current: key }),
  start: () => set({ started: true }),
  mark: (key, st) =>
    set((s) => {
      const { [key]: _, ...rest } = s.status;
      return { status: st ? { ...rest, [key]: st } : rest };
    }),
}));

/** The prototype's queue: the real demo Cards that wait, without the E2E filler ("… demo …"). */
export function protoQueue(cards: Card[], state: ProtoState): Card[] {
  const real = focusQueue(cards).filter((c) => !/demo/i.test(c.title));
  if (state === "empty") return [];
  if (state === "back") {
    const first = (k: AskKind) => real.find((c) => kindOf(c) === k);
    return [first("pr-approval"), first("decision"), first("design-round")].filter((c): c is Card => !!c);
  }
  return real;
}

export interface Option {
  key: string;
  text: string;
  raw: string;
  recommended: boolean;
}
export interface Ask {
  kind: AskKind;
  question: string;
  req: DecisionRequest | null;
  options: Option[];
  recommendation: { key: string; confidence: string | null } | null;
  round: DesignRound | null;
  look: LookNote | null;
}

export const VERDICTS: { key: PrVerdict; label: string; what: string }[] = [
  { key: "approve", label: "Approve", what: "The agent may merge" },
  { key: "hold", label: "Hold merge", what: "The PR stays open, labelled do-not-merge" },
  { key: "send-back", label: "Send back", what: "Back to the agent, with your note" },
];

export function askOfCard(card: Card): Ask {
  const kind = (kindOf(card) ?? "look") as AskKind;
  const req = card.requests.find((r) => r.id === card.waiting?.requestId) ?? null;
  const m = req?.recommendation ? /^(\S+?)(?:\s*\(confidence (\w+)\))?$/.exec(req.recommendation.trim()) : null;
  const recommendation = m ? { key: m[1]!, confidence: m[2] ?? null } : null;
  const isRec = (k: string) => !!recommendation && k.toLowerCase() === recommendation.key.toLowerCase();
  const round = kind === "design-round" ? (card.rounds.at(-1) ?? null) : null;
  let options: Option[] = [];
  if (kind === "decision")
    options = (req?.options ?? []).map((raw) => {
      const i = raw.indexOf(":");
      const key = (i > 0 ? raw.slice(0, i) : raw).trim();
      return { key, text: i > 0 ? raw.slice(i + 1).trim() : "", raw, recommended: isRec(key) };
    });
  if (kind === "pr-approval") options = VERDICTS.map((v) => ({ key: v.key, text: v.what, raw: v.label, recommended: isRec(v.key) }));
  if (kind === "design-round") options = (round?.variants ?? []).map((v) => ({ key: v.key, text: v.summary, raw: v.name, recommended: isRec(v.key) }));
  const question =
    kind === "look"
      ? (card.look?.headline ?? "Take a Look at the result")
      : kind === "design-round"
        ? (round?.question ?? req?.question ?? "Which variant?")
        : (req?.question ?? (kind === "pr-approval" ? `PR #${card.pullRequest?.number} awaits approval` : "Decision needed"));
  return { kind, question, req, options, recommendation, round, look: kind === "look" ? card.look : null };
}

/** Whether the draft is an answer that can be sent: the same rules as the Feedback panels on main. */
export function canSend(card: Card, d: Draft): boolean {
  const kind = kindOf(card);
  if (kind === "decision") return !!(d.choice || d.note.trim());
  if (kind === "design-round") return !!(d.picks.length || d.rejects.length || d.note.trim());
  if (kind === "pr-approval") return !!d.verdict && (d.verdict !== "send-back" || !!d.note.trim());
  return false;
}

/** Why Send does nothing yet, in the words of the panels on main. */
export function whyNot(card: Card, d: Draft): string | null {
  if (canSend(card, d)) return null;
  const kind = kindOf(card);
  if (kind === "decision") return "Pick an option or write an answer";
  if (kind === "design-round") return "Pick or reject a variant, or write a comment";
  if (kind === "pr-approval") return d.verdict ? "Send back needs a note" : "Pick Approve, Hold merge or Send back first";
  return null;
}

/** The exact comment Tandem writes for this draft (core/contract.ts), or null when there is nothing to send. */
export function literal(card: Card, d: Draft): string | null {
  if (!canSend(card, d)) return null;
  const ask = askOfCard(card);
  if (ask.kind === "decision") return answerComment(ask.req?.id ?? "D1", [d.choice?.split(":")[0]?.trim(), d.note.trim()].filter(Boolean).join(". "));
  if (ask.kind === "design-round") return roundReactionComment({ round: ask.round?.round ?? 1, picks: d.picks, rejects: d.rejects, comment: d.note });
  if (ask.kind === "pr-approval") return prVerdictComment(card.waiting?.requestId ?? null, d.verdict!, d.note);
  return null;
}

/** What happens once the comment is there, one line per kind: the receipt and the ledger say it. */
export function sets(card: Card, d: Draft): string {
  const kind = kindOf(card);
  const pushed = d.push ? "Pushed to the coordinator" : "No Push, the run picks it up at its next checkpoint";
  if (kind === "pr-approval") return d.verdict === "approve" ? `The agent merges PR #${card.pullRequest?.number}. ${pushed}` : d.verdict === "hold" ? "The PR stays open, do-not-merge" : `Back to the agent. ${pushed}`;
  if (kind === "design-round") return `The design agent takes it from here. ${pushed}`;
  return `The agent resumes. ${pushed}`;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The prototype's send: no request, a short wait, and one arranged failure per Card while the switcher's "Fail the next send" is on. */
export async function send(card: Card): Promise<boolean> {
  const s = useProto.getState();
  const d = s.drafts[card.key] ?? EMPTY;
  if (!canSend(card, d) || s.status[card.key] === "sending" || s.status[card.key] === "sent") return false;
  s.mark(card.key, "sending");
  await wait(420);
  const now = useProto.getState();
  if (now.fail && !now.failedOnce[card.key]) {
    useProto.setState({ failedOnce: { ...now.failedOnce, [card.key]: true }, fail: false });
    writeUrl({ variant: now.variant, state: now.state, fail: false, at: null });
    now.mark(card.key, "failed");
    return false;
  }
  now.mark(card.key, "sent");
  return true;
}

export const FAILURE = "GitHub did not take the comment (502). Nothing was written, your answer is kept.";

export const isDone = (st: Status | undefined) => st === "sent" || st === "seen";

/** The next Card that still asks something, after `key` and wrapping round; null when all are done. */
export function nextOpen(queue: Card[], status: Record<string, Status>, key: string | null): string | null {
  const i = Math.max(0, queue.findIndex((c) => c.key === key));
  for (let n = 1; n <= queue.length; n++) {
    const c = queue[(i + n) % queue.length]!;
    if (!isDone(status[c.key]) && c.key !== key) return c.key;
  }
  return null;
}

/** "Finished" in the switcher: every ask answered the way the agent recommended, every Look Seen. */
export function fillDone(queue: Card[]) {
  const drafts: Record<string, Draft> = {};
  const status: Record<string, Status> = {};
  for (const c of queue) {
    const ask = askOfCard(c);
    const rec = ask.options.find((o) => o.recommended) ?? ask.options[0];
    if (ask.kind === "look") status[c.key] = "seen";
    else {
      status[c.key] = "sent";
      drafts[c.key] = {
        ...EMPTY,
        choice: ask.kind === "decision" ? (rec?.raw ?? null) : null,
        verdict: ask.kind === "pr-approval" ? "approve" : null,
        picks: ask.kind === "design-round" && rec ? [rec.key] : [],
      };
    }
  }
  useProto.setState({ drafts, status, started: true, current: null });
}

export const SINCE = "14:20";
