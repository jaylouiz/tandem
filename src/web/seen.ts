// Seen on the web side: Look Cards the developer has taken a look at. Seen is local state (POST …/seen), nothing goes to GitHub.
// Buttons, keys, the palette and "opening a Card in To look at" all call `markSeen`.
import { shortRepo } from "./components/bits.tsx";
import type { Card } from "../core/types.ts";
import type { Nav } from "./route.ts";
import { api, currentCards, useStore, writeCard } from "./store.ts";

/** Look Cards among `cards` that are not Seen yet / are Seen (the only ones with a Seen state to change). */
export const unseenLooks = (cards: Card[]) => cards.filter((c) => c.needsLook && !c.seenAt);
export const seenLooks = (cards: Card[]) => cards.filter((c) => c.needsLook && !!c.seenAt);

/** The marked Cards, else the open Card (same targets as triage). */
export function seenTargets(s: Parameters<typeof currentCards>[0] & { marked: string[]; selected: string | null }): Card[] {
  const all = currentCards(s);
  const m = all.filter((c) => s.marked.includes(c.key));
  return m.length ? m : all.filter((c) => c.key === s.selected);
}

const label = (c: Card) => `${shortRepo(c.repo)}#${c.number}`;

/**
 * Mark `cards` Seen (or unseen): at once, written per Card, rolled back per Card on failure with one message.
 * `quiet` = no notice on success (opening a Card marks it; a toast per `j` would be noise).
 */
export async function markSeen(cards: Card[], seen = true, opts: { quiet?: boolean; undoable?: boolean; explicit?: boolean } = {}) {
  // judged on the Cards as they are now (an Undo hands back the Cards as they were)
  const now = currentCards(useStore.getState());
  const fresh = cards.map((c) => now.find((n) => n.key === c.key) ?? c);
  const targets = seen ? unseenLooks(fresh) : seenLooks(fresh);
  if (!targets.length) {
    if (opts.explicit) useStore.getState().setNotice({ key: cards[0]?.key ?? "", text: seen ? "Nothing to mark Seen: no unseen Look among them" : "Nothing to mark unseen", canStart: false });
    return;
  }
  const at = new Date().toISOString();
  const failed: string[] = [];
  const done: Card[] = [];
  await Promise.all(
    targets.map(async (card) => {
      const res = await writeCard(card, { seenAt: seen ? at : null }, () => api.post(`${api.cardPath(card)}/seen`, { seen }));
      if (res.ok) done.push(card);
      else failed.push(res.error);
    }),
  );
  const s = useStore.getState();
  const what = seen ? "Seen" : "unseen";
  if (failed.length) {
    const text = done.length ? `${done.length} of ${targets.length} marked ${what}. Failed: ${failed[0]}` : `Not marked ${what}: ${failed[0]}`;
    s.setNotice({ key: targets[0]!.key, text, canStart: false, failed: true });
  } else if (!opts.quiet) {
    const text = targets.length === 1 ? `Marked ${what} · ${label(targets[0]!)}` : `${targets.length} Cards marked ${what}`;
    s.setNotice({ key: targets[0]!.key, text, canStart: false, undo: opts.undoable === false ? undefined : () => void markSeen(done, !seen, { undoable: false }) });
  }
}

/** The developer opens a Card in Waiting on me (click, j/k, Enter): a To look at Card is marked Seen at once and stays listed while open. */
export function openFromList(card: Card, inLook: boolean, nav: Nav = "replace") {
  const s = useStore.getState();
  s.select(card.key, undefined, { nav });
  if (!inLook) return;
  s.setLinger(card.key);
  void markSeen([card], true, { quiet: true });
}

/** Key, bar and palette: mark the marked Cards (else the open Card) Seen at once; the marks are done with. */
export function markSelectionSeen(seen = true) {
  const s = useStore.getState();
  const targets = seenTargets(s);
  s.clearMarks();
  return markSeen(targets, seen, { explicit: true });
}
