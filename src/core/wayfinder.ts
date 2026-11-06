// Wayfinder maps and their decision tickets (brief job 11). Pure: a map is an issue labelled `wayfinder:map`,
// its tickets are its sub-issues, each labelled `wayfinder:<kind>` (~/.claude/skills/wayfinder/SKILL.md).
import type { WorkflowConfig } from "./config.ts";
import type { RawIssue, TicketKind, TicketStatus, WayfinderMap, WayfinderTicket } from "./types.ts";

const KINDS: TicketKind[] = ["research", "prototype", "grilling", "task"];

export const isWayfinderMap = (i: RawIssue, cfg: WorkflowConfig) => i.labels.includes(cfg.wayfinderMapLabel);

/** A map or a ticket: either way it stays off the Board and appears only in the maps view. */
export const isWayfinderIssue = (i: RawIssue, cfg: WorkflowConfig) =>
  isWayfinderMap(i, cfg) || i.labels.some((l) => l.startsWith(cfg.wayfinderTicketPrefix));

/** issue number -> one-line gist, from the map body's `## Decisions so far` lines `- [title](…/issues/<n>): gist`. */
export function parseIndex(body: string): Map<number, string> {
  const out = new Map<number, string>();
  const section = /^##\s+Decisions so far\s*$/im.exec(body);
  if (!section) return out;
  const rest = body.slice(section.index + section[0].length);
  const end = rest.search(/^##\s/m);
  for (const line of (end < 0 ? rest : rest.slice(0, end)).split("\n")) {
    const m = /^\s*[-*]\s*\[[^\]]*\]\([^)]*\/issues\/(\d+)\)\s*[:\-–—]\s*(.+?)\s*$/.exec(line);
    if (m) out.set(Number(m[1]), m[2]!);
  }
  return out;
}

function ticketOf(t: RawIssue, byNumber: Map<number, RawIssue>, gists: Map<number, string>, cfg: WorkflowConfig): WayfinderTicket {
  const kindLabel = t.labels.find((l) => l.startsWith(cfg.wayfinderTicketPrefix))?.slice(cfg.wayfinderTicketPrefix.length);
  const kind = KINDS.find((k) => k === kindLabel) ?? null;
  const assignees = t.assignees ?? [];
  // a blocker's state comes from the cache when it is there: closing it does not touch the blocked ticket's own data
  const blockedBy = (t.blockedBy ?? [])
    .map((b) => ({ number: b.number, title: byNumber.get(b.number)?.title ?? `#${b.number}`, open: (byNumber.get(b.number)?.state ?? b.state) === "open" }))
    .filter((b) => b.open)
    .map(({ number, title }) => ({ number, title }));
  let status: TicketStatus;
  if (t.state === "closed") status = t.stateReason === "not_planned" ? "dropped" : "decided";
  else if (assignees.length) status = "claimed";
  else if (blockedBy.length) status = "blocked";
  else status = "frontier";
  return {
    number: t.number,
    title: t.title,
    url: t.url,
    kind,
    status,
    assignees,
    blockedBy: status === "blocked" ? blockedBy : [],
    gist: status === "decided" ? (gists.get(t.number) ?? null) : null,
    closedAt: t.closedAt,
  };
}

/** Maps (open first, then closed) with their tickets: same-repo issues whose `parent` is the map, oldest first. */
export function buildMaps(issues: RawIssue[], cfg: WorkflowConfig): WayfinderMap[] {
  const byRepo = new Map<string, RawIssue[]>();
  for (const i of issues) {
    const list = byRepo.get(i.repo);
    if (list) list.push(i);
    else byRepo.set(i.repo, [i]);
  }
  const maps: WayfinderMap[] = [];
  for (const [repo, list] of byRepo) {
    const byNumber = new Map(list.map((i) => [i.number, i]));
    for (const m of list.filter((i) => isWayfinderMap(i, cfg))) {
      const gists = parseIndex(m.body);
      maps.push({
        key: `${repo}#${m.number}`,
        repo,
        number: m.number,
        title: m.title,
        url: m.url,
        body: m.body,
        state: m.state,
        updatedAt: m.updatedAt,
        tickets: list
          .filter((t) => t.parent === m.number && t.number !== m.number)
          .sort((a, b) => a.number - b.number)
          .map((t) => ticketOf(t, byNumber, gists, cfg)),
      });
    }
  }
  return maps.sort((a, b) => Number(a.state === "closed") - Number(b.state === "closed") || b.updatedAt.localeCompare(a.updatedAt));
}
