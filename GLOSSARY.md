# Tandem

A personal kanban board over GitHub issues where one developer steers agentic coding and gives human-in-the-loop feedback without leaving the board.

## Language

**Tandem**:
The product: one developer and their coding agents working the same GitHub issues, with the board as the human's seat.
_Avoid_: the tracker, the dashboard

**Board**:
The kanban view of issues across the developer's repos, with one column per Phase.
_Avoid_: project, kanban

**Lane**:
One repo's part of the Board when "Group by repo" is on: a collapsible head (repo, Card count) over that repo's columns, all under one shared row of Phase heads. Only a grouping of the Board by repo, never a Phase or a Next step.
_Avoid_: swimlane, group (Done days are groups)

**Phase**:
The rough stage of development a Card is in, which is its Board column: Inbox, Backlog, UX Design, Build, Done.
_Avoid_: column, status, lane

**Handed**:
A Backlog Card the developer gave to an agent ("Hand to agent") that no agent has started yet. On GitHub it is the issue status Todo (ADR 0006); once work starts, the Phase says so.
_Avoid_: assigned, queued, started

**Next step**:
The stage an agent or the developer takes next on a Card (design, specify, build), independent of its Phase. Spec, implementation and technical review are all activities inside the Build Phase.
_Avoid_: lane (in Tandem's UI), state

**Card**:
One GitHub issue as it appears on the Board.
_Avoid_: ticket, task

**Selection**:
The Cards the developer has marked on the Board to move or triage together (cmd/ctrl-click, shift-click, `x`). It spans columns, is never saved, and ends when the Cards move or the developer clears it.
_Avoid_: bulk, batch, marked set

**Wayfinder issue**:
An issue of the `/wayfinder` skill: a map (`wayfinder:map`) or one of its decision tickets (`wayfinder:<kind>`). Never a Card and never on the Board; Tandem does not show them (the Wayfinder maps view was removed, #15).
_Avoid_: epic, roadmap

**Feedback**:
Any human answer an agent waits on or reacts to: answering a decision request, reacting to a design round, approving or holding a merge, and (not blocking) accepting or challenging an agent decision.
_Avoid_: review, comment

**Waiting on me**:
The set of Cards blocked on the developer's Feedback (decision request, design round, PR approval), ordered by closeness to Done first, then by age. An agent decision never puts a Card here: the agent does not wait on it.
_Avoid_: notifications, queue

**Focus**:
Waiting on me, one Card at a time: the list steps aside and each ask is shown alone, the blockers first, then the unseen Looks. In Focus an option sends when it is clicked or its digit is pressed, and shows beforehand the comment it will write (a design round with further axes takes one pick per axis and sends on the pick that completes them); an answer with a note is sent from the note. A decision with several questions takes one pick per question and is sent with `⌘↵`. Giving Feedback or marking Seen moves on to the next Card; passing a Look does not mark it Seen. Started from the list (key `f`), left with `esc`.
_Avoid_: review mode, slideshow, wizard

**Agent decision**:
A choice an agent made on its own and recorded on the issue ("Agent decision (D<k>): not blocking"). The Card carries `agent-decided` until the developer accepts. States: new, accepted, challenged. It never blocks, so it is not Waiting on me.
_Avoid_: blocker, approval

**Look**:
The developer checking the finished result of a Card with UX impact after it reaches Done, at a prepared preview URL.
_Avoid_: QA, acceptance, review

**Seen**:
A Done Card whose Look the developer has taken. Seen Cards leave the Board after a while; unseen ones stay. Opening a Card in To look at marks it Seen; so do the row's Mark Seen button and Mark Seen on the Selection bar (key `e`).
_Avoid_: read, acknowledged

**Push**:
Tandem telling an agent that feedback has arrived, so that work resumes without the developer starting or pinging the agent themselves.
_Avoid_: trigger, dispatch, run

**Orca Run**:
An orchestration run in Orca: where a Push is sent (`run:<id>`). Tandem looks one up only when it sends a Push; "no Orca Run found" is a fact about that Push, never a statement about whether a coordinator is running (#14).
_Avoid_: coordinator state, session

**On hold**:
A Card the developer parked with the hold label (Hold Card in the Card's More menu, key `h`; Release hold takes it back). An agent does not pick it up. Not the same as **Hold merge**, the verdict on a PR approval that keeps the PR open. The toast says "Held" or "Released".
_Avoid_: pause, freeze, a bare "Hold" on a control (it names both)

**Agent activity**:
Which Cards in UX Design and Build an agent is working on, read from the coordination log: Working, Stuck (no movement for a while), Parked (waits on the developer), Queued (Feedback given, run not resumed), On hold.
_Avoid_: progress, status, jobs
