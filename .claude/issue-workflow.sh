# shellcheck shell=bash
# issue-workflow config: tandem. Sourced by the orchestrate-gh-issues scripts. Prose facts: .claude/issue-workflow.md.

WF_PORTS=4401-4405                    # one per worker: API on <port>, Vite on <port+100>, E2E_PORT=<port>
WF_MAX_WORKERS=3
WF_RISK_GLOBS=('src/core/contract.ts' 'src/core/card.ts' 'src/core/config.ts' 'src/server/github.ts' 'src/server/board.ts' 'src/server/push.ts')
WF_IGNORE_GLOBS=(package-lock.json '*.md' 'docs/**')
WF_REVIEW_LINES=400
WF_HOLD_LABELS="on-hold-after-spec do-not-merge"
WF_CHECKS_TSV="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)/agent-ledgers/checks.tsv"

# cwd: the PR's worktree, after the base branch was merged in.
wf_verify() { [ -d node_modules ] || npm ci --silent; E2E_PORT="${PORT:-4399}" npm run verify; }

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
