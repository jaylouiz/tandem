# 0004: Phases from configuration; the only local state is Seen marks, repo opt-ins and paths

Status: accepted, 2026-11-04

## Context

The workflow keeps evolving, so the mapping from labels and PR state to Phases must not be code. Tandem keeps no state GitHub cannot rebuild, except per-developer conveniences.

## Decision

- `src/core/config.ts` holds `DEFAULT_WORKFLOW`: ordered `phaseRules` (first match wins; conditions `state`, `anyLabel`, `anyStatus` (GitHub's native issue status, ADR 0006), `openPr`), lane label → Next step, hold labels, Look labels, retention days. It mirrors agent-workflow's phase table (`docs/contract.md`, "Phases and statuses"). `~/.tandem/state.json` key `workflow` overrides any field.
- `~/.tandem/state.json` also holds: `repos` (opt-in), `seen` (Card key → time), `optedInAt` (Done Cards closed before a repo was opted in count as Seen, so the first run does not flood "To look at"), `repoPaths` (where to start a coordinator).
- What Tandem writes as the user is unmarked, exactly like a comment typed on GitHub: `D<k>: <answer>`, `R<k>:` with `- pick:` and `- reject:` lines, `D<k>: Approve: merge` / `Hold` (plus `do-not-merge`) / `Send back`. Accepting agent decisions removes `agent-decided`. Triage sets lane labels and `on-hold`. Captured ideas get `inbox`.

## Consequences

- A label scheme change in agent-workflow needs a config edit, not a release.
- Losing `~/.tandem` loses only Seen marks and settings.

## Note, 2026-11-27 (#32)

What Tandem reads and writes is now written down in agent-workflow as the board client contract v1 (`docs/contract.md`: comments, replies, labels, phases and statuses, coordination log, Push and launch; until then two README sections and `decide.sh` were cited). The decision stands. Tandem records the version it implements in `CONTRACT_VERSION` (`src/core/contract.ts`) and holds its readers and writers against the contract's golden fixtures, vendored at a pinned revision in `src/core/contract-fixtures/` (`PIN.json`; `npm run contract:update -- <revision>`). The replies listed above carry the prefix `Decision D<k>: ` since #1. The fog label default is the contract's `needs-direction` (it was `needs-wayfinder`), and "Hand to agent" skips a Card labelled `on-hold`: the contract says no stage starts on it.
