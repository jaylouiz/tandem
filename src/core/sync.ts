// What a failed sync says to the developer (#2): what failed in plain words, since when, and that Tandem retries. Pure.
import type { BoardSnapshot } from "./types.ts";

export type RepoSync = BoardSnapshot["sync"][string];

const UNREACHABLE = "GitHub could not be reached";

/** The failure in plain words; the raw reason stays available as `detail`. */
export function syncFailure(error: string): { what: string; detail: string } {
  const detail = error.length > 300 ? `${error.slice(0, 300)}…` : error;
  // the network case already says it all in `what`: the detail is only Node's own reason
  if (error.startsWith(UNREACHABLE)) return { what: UNREACHABLE, detail: detail.slice(UNREACHABLE.length).replace(/^:\s*/, "") || UNREACHABLE };
  const status = /^GitHub (?:[A-Z]+ \S+|GraphQL): (\d{3})\b/.exec(error)?.[1];
  if (status === "401") return { what: "GitHub refused the login (401). Log in again with gh auth login", detail };
  if (status === "403" || status === "429") return { what: `GitHub refused the request (${status}), possibly a rate limit`, detail };
  if (status) return { what: `GitHub answered ${status}`, detail };
  return { what: "Sync failed", detail };
}

/** `Since 11:05 · last synced 10:58 · retrying every 15 s`; `clock` formats a time of day. */
export function syncFailureStatus(s: RepoSync, clock: (iso: string) => string, pollSeconds = 15): string {
  const parts: string[] = [];
  if (s.errorAt) parts.push(`Since ${clock(s.errorAt)}`);
  parts.push(s.okAt ? `last synced ${clock(s.okAt)}` : "never synced");
  parts.push(`retrying every ${pollSeconds} s`);
  return parts.join(" · ");
}
