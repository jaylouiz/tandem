# Retro log: tandem

## Context size (words)
| date | run | ~/.claude/CLAUDE.md | CLAUDE.md | issue-workflow.md | total | note |
|---|---|---|---|---|---|---|
| 2026-11-04 | run_c95e50cae215 | 524 / 30 | 366 / 26 | 807 | 1697 | first row |
| 2026-11-04 | run_c95e50cae215 (wave 2: #13 #19 #20 #23) | 524 / 29 | 371 / 26 | 870 | 1765 | +22 words profile (W3); no convergence needed |
| 2026-11-04 | run_cf77613a627c (#26 + agent-workflow#17) | 524 / 29 | 371 / 26 | 870 | 1765 | no edits; W5 seen 2, still caught by the reviewer route every time |
| 2026-11-05 | run_f7031804d2dd (22 issues, 15 PRs) | 524 / 29 | 388 / 26 | 900 | 1812 | run added ADR 0005 + routing lines (+73); convergence: CLAUDE.md routing detail trimmed (-26) |
| 2026-11-06 | run_bc1b0b0183b1 (#63 #68 #38, 3 PRs) | 524 / 29 | 407 / 26 | 919 | 1850 | CLAUDE.md +1 line (fixture reset, from #68); no convergence needed; no friction lines logged |

## Watch list
| id | root cause | kind | target | seen | last | status |
|---|---|---|---|---|---|---|
| W1 | zustand selector returns fresh `[]`/`{}` (render loop) | escaped | CLAUDE.md, package.json | 4 | run_c95e50cae215 | fixed 2026-11-04 package.json check:selectors: expect no recurrence |
| W2 | fixture issue numbers collide across PRs | escaped | src/core/fixtures.ts | 4 | run_c95e50cae215 | fixed 2026-11-04 fixtures unique-key test (#12): worked (caught #19 design's 117-119 collision) |
| W3 | fixture-server state is shared and in memory (E2E specs, prototype drag runs) | rediscovery | issue-workflow.md Verification + Prototype | 8 | run_f7031804d2dd | fixed 2026-11-06 tandem#68 (PR #71) POST /api/fixture/reset + auto-fixture in e2e/fixtures.ts: expect no shared-Card breakage; one unreproduced toast.spec:183 failure after rebase, watch |
| W4 | no documented client path to the live coordinator (Push) | missing-instruction | agent-workflow | 1 | run_c95e50cae215 | watching (agent-workflow#14) |
| W5 | lead self-review misses defects / skips the UI audit gate (PR #21 high, PR #25 audit + guard; agent-workflow#17 cross-reader divergence; #44 audit skip) | escaped | build-gh-issue, issue-workflow.sh | 3 | run_f7031804d2dd | fixed 2026-11-05 .claude/issue-workflow.sh wf_pr_body_check: expect no UI PR without an /impeccable audit line (guard blocks gh pr create/edit) |
| W6 | worker_done stayed [unhandled]; resume `send` after a session limit duplicated finished workers | tool-failure | orchestrate-gh-issues section 6 | 1 | run_c95e50cae215 | watching: next time worker-show before resuming |
| W7 | decide.sh run outside a git checkout fails quietly; records lost | missing-instruction | agent-workflow decide.sh | 2 | run_f7031804d2dd | watching: agent-workflow#21 (inbox) |
| W8 | parallel leads on hot files (App.tsx, store.ts, Palette.tsx) need merge-conflict fix rounds | rework | orchestrate-gh-issues screening | 4 | run_f7031804d2dd | watching: cheap per round (~10 min); act if a conflict ever breaks a merged feature |
| W9 | a lead's own fix rounds push the diff over WF_REVIEW_LINES after it reported route=lead | rework | task-template lead step 3 | 1 | run_f7031804d2dd | watching: prep catches it |
| W10 | coordinator command slips (unmarked gh issue comment, merge chained after prep, unquoted zsh var, next.sh output piped to head) | slip | orchestrate-gh-issues | 2 | run_bc1b0b0183b1 | watching: run_bc1b0b0183b1 repeated it (merge chained with `after`, next.sh piped to head); guard rule filed in agent-workflow inbox |
| W11 | worktree without node_modules fails merge-pr.sh prep verify | tool-failure | issue-workflow.sh wf_verify | 1 | run_f7031804d2dd | fixed 2026-11-05 .claude/issue-workflow.sh wf_verify runs npm ci when node_modules is missing: expect no tsc-not-found in prep |
