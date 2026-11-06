// Agent activity from the per-issue coordination log (`decide.sh log`, outside the repos): the last line of
// each log of an in-flight Card. The state is derived on the web side (src/core/activity.ts).
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { entryOf, inFlight } from "../core/activity.ts";
import type { ActivityEntry, Card } from "../core/types.ts";
import { isIssueNumber, isRepo } from "./guard.ts";

export function issueLogPath(repo: string, n: number) {
  // repo and number reach a file path: never let them step out of the log folder
  if (!isRepo(repo) || !isIssueNumber(n)) throw new Error(`not an issue: ${repo}#${n}`);
  return join(process.env.WF_ISSUE_LOG_DIR ?? join(homedir(), ".claude", "issue-logs"), repo, `${n}.md`);
}

/** card key -> last log line, for the Cards that have a log. */
export type ActivityReader = (cards: Card[]) => Promise<Record<string, ActivityEntry>>;

export const readLogActivity: ActivityReader = async (cards) => {
  const out: Record<string, ActivityEntry> = {};
  await Promise.all(
    cards.filter(inFlight).map(async (c) => {
      const path = issueLogPath(c.repo, c.number);
      try {
        const [text, st] = await Promise.all([readFile(path, "utf8"), stat(path)]);
        out[c.key] = entryOf(text, st.mtime.toISOString());
      } catch {
        // no log: the Card has no entry
      }
    }),
  );
  return out;
};
