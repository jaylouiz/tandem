// Agent activity (brief job 6): which Cards are being worked on, parked or stuck, and when each last moved.
// The server reads the per-issue coordination log (`decide.sh log`) and ships the last line; the state is derived here.
import type { WorkflowConfig } from "./config.ts";
import type { ActivityEntry, Card } from "./types.ts";

export type AgentState = "working" | "stuck" | "parked" | "queued" | "hold";

export const STATE_ORDER: AgentState[] = ["stuck", "working", "parked", "queued", "hold"];

export const STATE_LABEL: Record<AgentState, string> = {
  stuck: "Stuck",
  working: "Working",
  parked: "Parked",
  queued: "Queued",
  hold: "On hold",
};

/** Used when a Card has no log line to show. */
export const STATE_DEFAULT_TEXT: Record<AgentState, string> = {
  stuck: "no movement for a while",
  working: "no coordination log yet",
  parked: "waiting for your Feedback",
  queued: "your Feedback is on the issue, the run has not resumed",
  hold: "held, no agent assigned",
};

export interface LogLine {
  at: string;
  text: string;
}

/** Lines of a coordination log: `- 2026-11-04T11:15Z text`. Other lines (title, blank) are skipped. */
export function parseLog(text: string): LogLine[] {
  const out: LogLine[] = [];
  for (const line of text.split("\n")) {
    const m = /^- (\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?(?:\.\d+)?Z)\s+(.*\S)\s*$/.exec(line);
    if (m) out.push({ at: m[1]!.length === 17 ? m[1]!.replace("Z", ":00Z") : m[1]!, text: m[2]! });
  }
  return out;
}

/** The entry the server ships for a log: its last line, and the file's mtime when no line has a timestamp. */
export function entryOf(text: string, mtime: string | null): ActivityEntry {
  const lines = parseLog(text);
  const last = lines.at(-1);
  if (last) return { at: last.at, last: last.text };
  const free = text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).at(-1) ?? null;
  return { at: mtime, last: free };
}

/** In flight = a Card an agent may be working on: open, in UX Design or Build. */
export const inFlight = (c: Card) => c.state === "open" && (c.phase === "UX Design" || c.phase === "Build");

export interface Activity {
  state: AgentState;
  /** when the Card last moved: the later of its GitHub update and the log's last line */
  at: string;
  /** the last coordination log line, or null */
  last: string | null;
}

export function classifyActivity(card: Card, entry: ActivityEntry | undefined, now: number, cfg: Pick<WorkflowConfig, "stuckAfterHours">): Activity | null {
  if (!inFlight(card)) return null;
  const moved = [card.updatedAt, entry?.at].filter((t): t is string => !!t && !Number.isNaN(Date.parse(t))).sort().at(-1) ?? card.updatedAt;
  const last = entry?.last ?? null;
  if (card.waiting) return { state: "parked", at: moved, last };
  if (card.awaitingPickup) return { state: "queued", at: moved, last };
  if (card.onHold) return { state: "hold", at: moved, last };
  const quiet = now - Date.parse(moved) > cfg.stuckAfterHours * 3_600_000;
  return { state: quiet ? "stuck" : "working", at: moved, last };
}

export interface AgentRow {
  card: Card;
  act: Activity;
}

/** Every in-flight Card with its activity, grouped by state in overlay order, most recently moved first. */
export function agentGroups(cards: Card[], activity: Record<string, ActivityEntry>, now: number, cfg: Pick<WorkflowConfig, "stuckAfterHours">): { state: AgentState; rows: AgentRow[] }[] {
  const rows = cards.flatMap((card) => {
    const act = classifyActivity(card, activity[card.key], now, cfg);
    return act ? [{ card, act }] : [];
  });
  return STATE_ORDER.map((state) => ({ state, rows: rows.filter((r) => r.act.state === state).sort((a, b) => b.act.at.localeCompare(a.act.at)) })).filter((g) => g.rows.length);
}

/** The counts for the sidebar status line. */
export function agentCounts(groups: { state: AgentState; rows: AgentRow[] }[]) {
  const n = (s: AgentState) => groups.find((g) => g.state === s)?.rows.length ?? 0;
  return { working: n("working"), stuck: n("stuck") };
}
