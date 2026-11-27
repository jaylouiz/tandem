# 0003: Push via an Orca orchestration message to the coordinator's Run

Status: accepted, 2026-11-04

## Context

Tandem has no agent operations layer. Feedback must reach the running `/orchestrate-gh-issues` coordinator without typing into terminals and without changing the developer's Orca or Claude Code setup.

## Decision

- **Find the coordinator**: `orca terminal list` (connected terminals and their worktree paths), `orca orchestration run-list` (newest first) and `run-show --full` (`coordinator_handle`). A Run whose coordinator terminal is connected belongs to the repo of that terminal's checkout (`git remote get-url origin`). The newest live Run per repo wins. Cached for 15 s, one lookup at a time. Since 2026-11-24 (#14) the lookup runs only when a Push is sent (and for the checkout paths in Settings): the Board no longer shows whether a coordinator is running, because the lookup can miss one (a coordinator in a structure it does not recognise) and a wrong claim invites starting a second. A Run's `coordinator_handle` never changes, so `run-show` is asked once per Run (it was one `orca` call per Run on every look: 2-15 s under load, and a call that timed out counted as "none running"). A lookup that cannot finish keeps the last answer (a Run that cannot be read keeps its own, retried after 2 s; an unreachable Orca stands for 2 min); Push asks Orca once more before saying none, and says "none running" only from a complete answer: when Orca cannot be reached, or a Run could not be read (so a coordinator may be among them), it says "could not reach Orca" / "could not read Orca Run …" instead.
- **Push**: `orca orchestration send --to run:<id> --type status --subject "tandem push: <owner/repo>#<n> <feedback|start>" --body …`. Orca wakes the coordinator, which sweeps `decide.sh status` (feedback) or starts the Card's Next step (start). The subject format is the contract with agent-workflow.
- **No Run found**: the Push reports "not pushed: no Orca Run found for <repo>" as a fact about that Push, and its toast offers "Start coordinator" (also in the command palette for a Card that awaits pickup): `orca agent launch --agent claude --worktree path:<checkout> --prompt "/orchestrate-gh-issues #<n>"`. The checkout comes from Orca's known terminals or the path in Settings. The Card itself only shows "Feedback given, awaiting pickup" (an answered but unresolved decision request on GitHub).
- Push is on by default and can be switched off per piece of Feedback. The Feedback itself always lands on GitHub, so nothing is lost when a Push fails.

## Consequences

- Coordinators must handle `tandem push:` messages (agent-workflow issue).
- A coordinator that ran `/clear` but kept its terminal still counts as live. Its Run then gets the message, and the next real coordinator sweep picks the Feedback up from GitHub anyway.

## Note, 2026-11-27 (#33)

agent-workflow renamed its skills with an `aw-` prefix (agent-workflow#29): the coordinator skill named `/orchestrate-gh-issues` above is now `/aw-coordinate` (renamed again from `/aw-orchestrate`, agent-workflow#50). The decision stands. "Start coordinator" no longer hard-codes the name: it launches `<coordinatorCommand> #<n>`, where `coordinatorCommand` is a field of the workflow config (`DEFAULT_WORKFLOW` in `src/core/config.ts`, default `/aw-coordinate`; `~/.tandem/state.json` key `workflow` overrides it, ADR 0004), so the next rename is a config change. The Push subject `tandem push: <owner/repo>#<n> <feedback|start>` does not carry the skill name and is unchanged.

## Note, 2026-11-27 (#32)

The Push subject and the launch prompt are part of agent-workflow's board client contract v1 (`docs/contract.md`, "Push and launch"), which Tandem pins (ADR 0004, note of the same day).
