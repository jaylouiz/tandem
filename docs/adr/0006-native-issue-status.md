# 0006: GitHub's native issue status carries started work and "handed"

Status: accepted, 2026-11-24. Decided by the user on #18 (D1: mapping "started work, handed"; writers "agent-workflow, Tandem").

## Context

A Card's Phase came from conventions only Tandem and agent-workflow read (`phase:design`, `phase:build`, the lane labels), and "handed to an agent, not started yet" was a record in the open page: gone with a reload, invisible to a second device and to the coordinator. GitHub now has a status per issue (preview): Backlog, Todo, In progress, In review, Done, Not planned, Duplicate, fixed per repo, readable in REST and GraphQL (`Issue.status`), writable with `setIssueStatus`. A new issue starts as Backlog, an older one has none, a closed one gets Done from GitHub.

## Decision

- **Reading**: the status is one more field of the synced issue (`RawIssue.status`, the name). The Phase rules ask it first: In progress is UX Design in the design lane (`needs-design`), else Build; In review is Build. Backlog, Todo, no status or an unknown one say nothing about the Phase, so the label rules decide, as before. The rules stay configuration (`anyStatus` in `phaseRules`, ADR 0004).
- **Handed**: status Todo on an open Backlog Card that is not on hold (`handedStatus`). It replaces the page-side record.
- **Writing**: Tandem writes a status only on the developer's own action. "Hand to agent" sets Todo before the Push (a failed write stops before anything is sent) and puts the previous status back when the Push does not arrive. Re-steering a handed Card (another Next step, a hold, a move) sets Backlog (`unhandedStatus`): a status cannot be cleared. Statuses are looked up by name on every write, never by a remembered id. A status is no comment: nothing an agent could read as a marker.
- **agent-workflow** writes In progress, In review and Backlog next to the labels it writes today; `WF_PHASE_LABELS=off` stops the phase labels later. Tandem works with or without that, and keeps the label rules as the fallback.
- **No statuses** (a repo or a GitHub without the field): the issues are read without it (one retry of the same page, remembered until the next full fetch), the Board runs from labels, and "Hand to agent" pushes without a status and shows no handed text.

## Consequences

- A status change moves the issue's `updatedAt` and the ETag of the list Tandem polls (verified on the real API, 2026-11-24), so ADR 0002's change detection covers it; there is no timeline event, hence no time on the handed text.
- Lanes, holds, `inbox` and `needs-decision` stay labels: no status fits them.
- With an agent-workflow that writes labels only, a Card that returns from UX Design to Backlog still reads as handed (Todo was never taken back); hold and release clears it.
- The cut-over is a switch in agent-workflow and, later, the removal of the two label rules here.
