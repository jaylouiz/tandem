# Tandem: build brief

You are building **Tandem**: a personal kanban board over GitHub issues where one developer steers agentic coding and gives human-in-the-loop feedback without leaving the board. This brief says *what* Tandem must do and *why*. UI, interaction details, architecture and tech stack are yours to decide. Record the decisions that are hard to reverse as ADRs in `docs/adr/`.

Use the vocabulary in [`GLOSSARY.md`](../GLOSSARY.md) everywhere: code, UI copy, issues.

## Why it exists

The developer runs coding agents through their own workflow ([agent-workflow](https://github.com/jaylouiz/agent-workflow) skills, driven by Orca and Claude Code). Agents work on GitHub issues and stop when they need a human: a decision request, a design round to react to, a PR to approve. Today that feedback is scattered across GitHub notifications, issue comments, screenshots that are awkward to browse, and terminals. Tandem gives the human one seat: see what waits on them, answer it in place, and have the agent pick the answer up without being pinged.

## User

One developer, working across several of their own repos, at a desktop. No team features.

## User jobs

Core (the product exists for these):

1. **See what waits on me.** One list across all repos of every Card blocked on my Feedback: decision requests, design rounds, PRs awaiting approval. Order: closest to Done first, then oldest. Unseen Looks form their own "To look at" group below the blockers. Every page starts with the Card pane closed, Waiting on me included; opening a Card in To look at marks it Seen, and it stays listed until another Card opens. Agent decisions are not blockers (the agent never waits on them, `agent-decided` holds no merge): they are not in this list or its counts and raise no notification.
2. **Answer a decision request in place**, with the question, the options and the agent's recommendation in front of me. Then Push.
3. **Accept or challenge an agent decision**, at my own pace. The Card's Now tab carries at most one quiet line ("1 agent decision, not blocking") that opens the Decided tab, where each decision shows its state (new, accepted, challenged) and can be accepted or challenged. Then Push.
4. **React to a design round.** Browse the round's screenshots in an in-app gallery (back/forward navigation, keyboard; grouped by variant and viewport) and open the prototype preview URL. Pick or reject variants and comment. Then Push.
5. **Approve, hold or send back a PR**, with the agent's summary, verification results and review findings in view. Line-by-line diff review stays on GitHub (link out).

Secondary:

6. **See what agents are doing**: which Cards are being worked on, parked or stuck, and when each last moved. Agent progress comes from the per-issue coordination log (contract item 5), shown on demand and kept out of the way of decisions.
7. **Hand a Card to an agent**: start its Next step with a Push.
8. **Triage**: move Inbox Cards into the Backlog, set a Next step, put Cards on hold, reprioritize.
9. **Capture an idea fast**, as a new issue straight from the Board.
10. **Take a Look at finished work**: for Done Cards with UX impact, open the prepared preview URL and the final screenshots, then mark the Card Seen.
11. **See wayfinder maps** (issues labelled `wayfinder:map`) and their decision tickets, read-only. The grilling itself stays in the terminal.
12. **Get notified** with a desktop notification when something new waits on me.
13. **Understand a Card at a glance**: what was decided and what waits on me, in a structured form with full detail one step away, never as a raw comment thread.

## Board model

The Board shows Cards from the repos the developer opts into, across all of them in one view, with a repo filter. Columns are **Phases**:

| Phase | A Card is here when |
|---|---|
| Inbox | labelled `inbox`, or fog that needs `/wayfinder` |
| Backlog | triaged with a Next step, but no agent or round has started |
| UX Design | a design round is running or waiting on Feedback |
| Build | specify, build or review is running, or a PR is open |
| Done | PR merged and issue closed |

- **Next step** (design / specify / build) is separate from Phase: it says what happens next, and the Card shows it. Spec, implementation and technical review are activities inside Build.
- Phases and their mapping from labels and PR state come from configuration, not code. The workflow will keep evolving.
- **Done and Look**: a Card needs a Look if it went through UX Design or carries `ux-impact`. Until it is Seen it stays in Done, visibly marked as new. Seen Cards leave the Board 7 days after being marked Seen. Done Cards without UX impact count as Seen right away.

## Push

Tandem has **no agent operations layer of its own**: it does not run, host or supervise agents. When the developer gives Feedback, or hands a Card to an agent, Tandem pushes it on through the local Orca CLI (`orca`; see `orca agent-context` for its schema):

- The Push goes to the running `/orchestrate-gh-issues` coordinator, which already knows how to resume parked issues.
- Tandem never types into worker terminals and never changes the developer's own Orca or Claude Code setup.
- If no coordinator is running, the Card shows "Feedback given, awaiting pickup" with a one-click option to start one.
- Push is on by default and can be switched off for a single piece of Feedback.

## Hard requirements

- **GitHub is the source of truth.** Tandem acts as the developer (their GitHub identity) and writes exactly what the workflow already writes: the same comment markers and labels as agent-workflow's scripts (e.g. `decide.sh`). An agent cannot tell whether an answer came from Tandem or from GitHub. Tandem keeps no state that GitHub cannot rebuild, except per-developer conveniences such as Seen marks and the repo opt-in list.
- **Local-first**: runs on the developer's Mac, since Push needs the local Orca CLI. Desktop only.
- **Look and feel like Linear**: keyboard-first, command palette, instant and optimistic updates, dense but calm, polished light and dark themes. Everything else about the UI is up to the design agents.
- **Fast**: opening the Board and moving between Cards feels instant even across several repos. Rate limits must not degrade the experience.

## Workflow contract changes (implemented in agent-workflow, not here)

Tandem relies on these. File them as issues in the agent-workflow repo; Tandem only consumes the result.

1. **Phase labels** ([agent-workflow#7](https://github.com/jaylouiz/agent-workflow/issues/7)): a label scheme that maps cleanly to the Phases and the Next step. An overhaul of the current lane labels (`needs-design`, `needs-spec`, `ready`, holds) is allowed.
2. **`ux-impact` label** ([agent-workflow#8](https://github.com/jaylouiz/agent-workflow/issues/8)), set by the Build agent when a change touches UI.
3. **Look comment** ([agent-workflow#9](https://github.com/jaylouiz/agent-workflow/issues/9)): Build leaves a marked comment with a preview URL seeded to show the change, final screenshots, and what to check.
4. **Machine-readable design rounds** ([agent-workflow#10](https://github.com/jaylouiz/agent-workflow/issues/10)): screenshots in a round comment are marked by variant and viewport, so Tandem can build the gallery.
5. **Human-readable issue threads** ([agent-workflow#11](https://github.com/jaylouiz/agent-workflow/issues/11)): only what a human reads or a decision rests on stays on the issue (body, design rounds, decision requests and answers, agent decisions, Look, one closing summary), each in a fixed short structure. Agent-to-agent coordination (stage starts, progress, fix rounds, resume notes) moves to a temporary per-issue Markdown log outside the repo, which Tandem may read locally.

## Decide yourself

UI and interaction design, information architecture, tech stack, how GitHub data is fetched and kept fresh, packaging and launch, how the coordinator is found, and the Seen store. Use the developer's workflow for it: Design for the UX (`/design-gh-issue`), then Specify and Build.

## Out of scope

Team or multi-user features. Phone or remote access (a possible later effort). Running or hosting agents. Line-by-line code review. Replacing GitHub's issue editor beyond what the jobs need. Interactive grilling for wayfinder maps.
