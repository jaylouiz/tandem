// One visit to Focus: where it is (start, an ask, the end), what was sent in it (the receipt) and which asks are being written right
// now. Web state only, in memory; it starts over whenever Focus is left. The one thing kept is when Focus was last left
// (`tandem.focus.left` in localStorage), so the next visit can say what is new since then.
import { create } from "zustand";
import { feedbackComment, type Feedback } from "../../core/answer.ts";
import { kindOf, type Kind } from "../../core/ask.ts";
import type { Card } from "../../core/types.ts";
import { VERDICTS, type SendVia } from "../feedback/answers.ts";
import { markSeen } from "../seen.ts";
import { currentCards, useStore, type Tab } from "../store.ts";

export const LEFT_KEY = "tandem.focus.left";

/** One line of the receipt: a Card answered in this Focus with the comment that was written, or a Look marked Seen (`comment` null). */
export interface ReceiptEntry {
  key: string;
  title: string;
  repo: string;
  number: number;
  kind: Kind;
  comment: string | null;
  /** what the answer set off, in a few words */
  effect: string;
}

export type Stage = "start" | "ask" | "end";

interface Session {
  stage: Stage;
  /** when Focus was last left before this visit (ISO), or null on the first visit */
  since: string | null;
  /** the Card details drawer is open */
  details: boolean;
  /** card key -> the note (or a round's comment) is open: options only pick, the Send bar sends */
  noting: Record<string, boolean>;
  /** card key -> the Card as it was when its send started: the ask stays on screen until the write is through */
  sending: Record<string, Card>;
  /** card key -> the last send from its cover did not go through (the reason is the store's `failures`): its Send bar says so and offers Send again. Another write's failure on that Card (accepting agent decisions in the drawer) is not the cover's */
  failed: Record<string, boolean>;
  /** where the ask on screen sits in the queue (the last known place once it has left it): j / k and the arrows step from here */
  at: number;
  receipt: ReceiptEntry[];
  setStage: (stage: Stage) => void;
  setDetails: (open: boolean, tab?: Tab) => void;
  setNoting: (key: string, on: boolean) => void;
}

const NO_NOTES: Record<string, boolean> = {};
const NO_SENDS: Record<string, Card> = {};
const NO_RECEIPT: ReceiptEntry[] = [];

const readLeft = (): string | null => {
  try {
    const v = localStorage.getItem(LEFT_KEY);
    return v && !Number.isNaN(Date.parse(v)) ? v : null;
  } catch {
    return null;
  }
};

const fresh = () => ({ stage: "start" as Stage, since: readLeft(), details: false, noting: NO_NOTES, sending: NO_SENDS, failed: NO_NOTES, at: 0, receipt: NO_RECEIPT });

export const useFocus = create<Session>((set) => ({
  ...fresh(),
  setStage: (stage) => set({ stage }),
  setDetails: (details, tab) => {
    // the drawer has no Now tab (the ask is on the cover): it opens on the tab asked for, else on the issue text
    const s = useStore.getState();
    if (details && s.selected) s.select(s.selected, tab ?? (s.tab === "now" ? "issue" : s.tab));
    set({ details });
  },
  setNoting: (key, on) =>
    set((s) => {
      if (!!s.noting[key] === on) return {};
      const { [key]: _, ...rest } = s.noting;
      return { noting: on ? { ...rest, [key]: true } : Object.keys(rest).length ? rest : NO_NOTES };
    }),
}));

// Focus goes on and off in the app's store (the key `f`, a view change, Esc). Going on starts a visit; going off ends it and keeps the time.
useStore.subscribe((s, was) => {
  if (s.focus === was.focus) return;
  if (!s.focus) {
    try {
      localStorage.setItem(LEFT_KEY, new Date().toISOString());
    } catch {}
  }
  useFocus.setState(fresh());
});

const receiptOf = (card: Card, comment: string | null, effect: string): ReceiptEntry => ({ key: card.key, title: card.title, repo: card.repo, number: card.number, kind: kindOf(card) ?? "look", comment, effect });

/** What an answer sets off, for the receipt. */
export function effectOf(f: Feedback): string {
  switch (f.action) {
    case "answer":
      return "The agent goes on with your answer";
    case "pr":
      return VERDICTS.find(([v]) => v === f.body.verdict)![2];
    case "round":
      return "The agent takes your reaction into the next step";
  }
}

/**
 * How Focus sends: one send per Card at a time (a second click or digit while the write runs does nothing), the ask held on screen
 * until the write is through, and the comment kept for the receipt once it is. The write itself is the usual one (`giveFeedback`).
 */
export const focusSend: SendVia = async (card, feedback, run) => {
  if (useFocus.getState().sending[card.key]) return false;
  const without = (m: Record<string, boolean>) => {
    const { [card.key]: _, ...rest } = m;
    return Object.keys(rest).length ? rest : NO_NOTES;
  };
  useFocus.setState((s) => ({ sending: { ...s.sending, [card.key]: card }, failed: without(s.failed) }));
  let sent = false;
  try {
    sent = await run();
  } finally {
    useFocus.setState((s) => {
      const { [card.key]: _, ...rest } = s.sending;
      const on = useStore.getState().focus; // only a visit that is still on keeps the line: leaving Focus started a new session
      return {
        sending: Object.keys(rest).length ? rest : NO_SENDS,
        failed: !sent && on ? { ...s.failed, [card.key]: true } : s.failed,
        // every comment written is a line of its own: a Card answered twice in one visit (D1, then D2) shows both
        receipt: sent && on ? [...s.receipt, receiptOf(card, feedbackComment(feedback), effectOf(feedback))] : s.receipt,
      };
    });
  }
  return sent;
};

/** Mark the Look Seen from Focus: quiet (the next Card says it), and on the receipt once it is written. Nothing goes to GitHub. */
export async function focusSeen(card: Card) {
  await markSeen([card], true, { quiet: true });
  const now = currentCards({ ...useStore.getState(), repoFilter: null }).find((c) => c.key === card.key);
  if (!now?.seenAt || !useStore.getState().focus) return;
  const days = useStore.getState().board?.workflow.seenRetentionDays ?? 7;
  useFocus.setState((s) => ({ receipt: [...s.receipt.filter((r) => r.key !== card.key || r.comment !== null), receiptOf(card, null, `It leaves the Board ${days} days after it was Seen`)] }));
}
