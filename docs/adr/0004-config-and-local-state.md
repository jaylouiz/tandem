# 0004: Phases from configuration; the only local state is Seen marks, repo opt-ins and paths

Status: accepted, 2026-11-04

## Context

The workflow keeps evolving, so the mapping from labels and PR state to Phases must not be code. Tandem keeps no state GitHub cannot rebuild, except per-developer conveniences.

## Decision

- `src/core/config.ts` holds `DEFAULT_WORKFLOW`: ordered `phaseRules` (first match wins; conditions `state`, `anyLabel`, `openPr`), lane label → Next step, hold labels, Look labels, retention days. It mirrors the agent-workflow README phase table. `~/.tandem/state.json` key `workflow` overrides any field.
- `~/.tandem/state.json` also holds: `repos` (opt-in), `seen` (Card key → time), `optedInAt` (Done Cards closed before a repo was opted in count as Seen, so the first run does not flood "To look at"), `repoPaths` (where to start a coordinator).
- What Tandem writes as the user is unmarked, exactly like a comment typed on GitHub: `D<k>: <answer>`, `R<k>:` with `- pick:` and `- reject:` lines, `D<k>: Approve: merge` / `Hold` (plus `do-not-merge`) / `Send back`. Accepting agent decisions removes `agent-decided`. Triage sets lane labels and `on-hold`. Captured ideas get `inbox`.

## Consequences

- A label scheme change in agent-workflow needs a config edit, not a release.
- Losing `~/.tandem` loses only Seen marks and settings.
