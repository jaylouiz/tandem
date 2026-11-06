// The Done column at real scale: Look first, the rest grouped by the day a Card closed. Pure.
import type { Card } from "./types.ts";

export interface DayGroup {
  /** local date, YYYY-MM-DD */
  day: string;
  label: string;
  cards: Card[];
}

const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Done Cards by closing day, newest day first; inside a day the most recent close first. */
export function groupByDay(cards: Card[], now = new Date()): DayGroup[] {
  const today = localDay(now.toISOString());
  const yesterday = localDay(new Date(now.getTime() - 86_400_000).toISOString());
  const map = new Map<string, Card[]>();
  for (const c of cards) {
    const day = localDay(c.closedAt ?? c.updatedAt);
    map.set(day, [...(map.get(day) ?? []), c]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, list]) => ({
      day,
      label: day === today ? "Today" : day === yesterday ? "Yesterday" : new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
      cards: list.sort((a, b) => (b.closedAt ?? b.updatedAt).localeCompare(a.closedAt ?? a.updatedAt)),
    }));
}

/** Done Cards split into the Look group (needs a Look, not Seen) and the rest. */
export const splitDone = (done: Card[]) => ({
  look: done.filter((c) => c.needsLook && !c.seenAt).sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? "")),
  rest: done.filter((c) => !(c.needsLook && !c.seenAt)),
});
