// Waiting on me: after the developer answered the open blocker, the next blocker takes its place (`giveFeedback` asks). Nothing else opens a Card by itself.

/** What the list looked like before the developer's answer. */
export type WaitingWas = { keys: string[]; sel: string | null; filter: string | null };

/**
 * Called for the developer's own answer only. The open blocker was answered when it was open before and has left the list since, with the repo filter unchanged
 * (a filter change drops Cards from the list without anyone answering them, and must not open another repo's blocker).
 * `{ open: key }` = open that blocker; `{ open: null }` = the list is empty, the pane keeps the Card; null = not an answer.
 */
export function nextAfterAnswer(was: WaitingWas, now: { keys: string[]; selected: string | null; filter: string | null }): { open: string | null } | null {
  const { selected } = now;
  const answered = selected !== null && now.filter === was.filter && selected === was.sel && was.keys.includes(selected) && !now.keys.includes(selected);
  if (!answered) return null;
  return { open: now.keys.length ? now.keys[Math.min(was.keys.indexOf(selected), now.keys.length - 1)]! : null };
}
