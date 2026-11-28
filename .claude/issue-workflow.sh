# shellcheck shell=bash
# issue-workflow config: tandem. Sourced by the agent-workflow scripts (spec.sh, merge-pr.sh, guard.sh). Prose facts: .claude/issue-workflow.md.
# Check the result with: bash ~/.claude/agent-workflow/bin/settings.sh show

WF_PORTS=4401-4405                    # one per worker: API on <port>, Vite on <port+100>, E2E_PORT=<port>
WF_PROTO_PORTS=4411-4419              # prototype previews that stay up while a design decision waits (Vite on <port+100>); outside WF_PORTS
WF_MAX_WORKERS=3
WF_RISK_GLOBS=('src/core/contract.ts' 'src/core/card.ts' 'src/core/config.ts' 'src/server/github.ts' 'src/server/board.ts' 'src/server/push.ts')
WF_IGNORE_GLOBS=(package-lock.json '*.md' 'docs/**')
WF_REVIEW_LINES=400
WF_HOLD_LABELS="on-hold on-hold-after-spec do-not-merge"   # hold a merge; on-hold (Tandem's Hold Card) also stops every stage start (agent-workflow docs/contract.md)
WF_PHASE_LABELS=off                   # the GitHub issue status carries the phase; no phase:* labels (agent-workflow docs/phase-label-cutover.md, #43)
WF_CHECKS_TSV="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)/agent-ledgers/checks.tsv"

# cwd: the PR's worktree, after the base branch was merged in.
wf_verify() { [ -d node_modules ] || npm ci --silent; E2E_PORT="${PORT:-4399}" npm run verify; }

# cwd: the PR's worktree, on every prep. merge-pr.sh prep verifies only a head it changed (behind or unpushed); a lead's own run is scoped,
# so the full gate runs here unless prep just verified this head (its prep-expect file names the pushed sha; retro W24).
wf_prep_check() {
  local f; f="$(git rev-parse --absolute-git-dir)/prep-expect"
  if [ -f "$f" ] && [ "$(cut -d' ' -f1 "$f")" = "$(git rev-parse HEAD)" ]; then return 0; fi
  wf_verify
}

# cwd: the main checkout, after the merge.
wf_after_merge() {
  if [ "$(git branch --show-current)" != main ]; then echo "main checkout not on main: skipped the fast-forward"; return 0; fi
  local before; before=$(git rev-parse HEAD)
  git fetch -q origin main && git merge -q --ff-only origin/main || { echo "ff-only to origin/main failed"; return 1; }
  if git diff --name-only "$before" HEAD | grep -qx package-lock.json; then npm ci --silent; fi
}

# $1 = the PR body file
wf_pr_body_check() {
  grep -Eq '^(Closes|Fixes) #[0-9]+' "$1" || { echo "missing 'Closes #<n>' line"; return 1; }
  # UI PRs carry the design gate's result (profile "Design quality"; skipped once, retro W5)
  if git diff --name-only origin/main...HEAD 2>/dev/null | grep -q '^src/web/'; then
    grep -qi 'impeccable audit' "$1" || { echo "UI PR without the '/impeccable audit' result line"; return 1; }
  fi
}
