// How long ago, as the app says it. Pure (reads the clock only): `bits.tsx` re-exports both.

/** `now`, `5m`, `3h`, `2d`: the bare age, for a column of ages and for "waiting 3h". */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const s = (now - Date.parse(iso)) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** The age inside a sentence: `2d ago`, and `just now` under a minute (never "now ago", #20). */
export function agoText(iso: string | null, now = Date.now()): string {
  const a = ago(iso, now);
  return a === "now" ? "just now" : a ? `${a} ago` : "";
}
