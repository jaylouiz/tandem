# issue-workflow profile: tandem

<!-- Read by the agent-workflow skills (https://github.com/jaylouiz/agent-workflow). Project facts only; commands and
     invariants live in CLAUDE.md. -->

## Labels

- lanes: `needs-design` → `needs-spec` → `ready`; phases `phase:design`, `phase:build` (agent-workflow README)
- hold: `on-hold-after-spec` = stop after Specify; `do-not-merge`
- context labels triage may add: `enhancement`, `bug`, `polish`, `a11y`, `ux-impact`
- `inbox` and `wayfinder:*` issues are never in a lane

## Sources

- product: `docs/brief.md` (user jobs 1-13, Board model, Push, hard requirements), `GLOSSARY.md` (use its terms in code, UI copy and issues)
- architecture: `docs/adr/` (0001 local web app, 0002 GitHub sync, 0003 Push via Orca, 0004 config and local state)
- design system: `DESIGN.md` (direction, tokens, named rules; written by `/impeccable document`), implemented as tokens in `src/web/styles.css` (`:root` with `light-dark()`; dark follows `prefers-color-scheme` unless `[data-theme]`). Update DESIGN.md when a token or named rule changes
- the contract Tandem reads and writes: agent-workflow README ("Comment markers", phase table) and `skills/orchestrate-gh-issues/decide.sh`; Tandem's side is `src/core/contract.ts`

## Design quality

Impeccable plugin (`/impeccable <verb>`). Mode: Operate (a dense tool for one expert user, "look and feel like Linear": keyboard-first, calm, dense).
- brief: `/impeccable shape <goal>`; as a worker, asserted from the issue, `docs/brief.md` and this profile
- current-state review: `/impeccable critique <target>`, `/impeccable audit <target>`
- variant lenses: `distill`, `clarify`, `onboard` (empty and first-run states) as thinking lenses
- build: `/impeccable <outcome and target>` with the spec's ACs
- gate (UI PRs): `/impeccable audit` on the touched surface, one bounded pass unattended; fix P0/P1, list P2/P3 in the PR
- polish / detector: `/impeccable polish <target>`; detector hook stays on

## Default acceptance criteria (UI)

- [ ] Empty, loading and error states handled
- [ ] Fully usable by keyboard (shortcut listed in the command palette); focus visible
- [ ] Light and dark theme both checked (screenshots of both)
- [ ] Optimistic: the UI reflects the action at once; a failure rolls back with a message
- [ ] Only tokens from `src/web/styles.css`, no raw hex in components
- [ ] GLOSSARY.md terms in UI copy (Card, Phase, Next step, Feedback, Push, Look, Seen, Waiting on me)

## Components

Own components in `src/web/components/`; `cmdk` for the command palette (https://github.com/pacocoursey/cmdk). Dialog, Toast, Tooltip (later Menu/Popover) come from Base UI (`@base-ui/react`) behind thin wrappers in `src/web/ui/`; components import the wrappers, never the library. Tokens from `src/web/styles.css` stay the only styling (Base UI ships no CSS). `docs/adr/0005-ui-component-library.md`.

## Screenshots

- tool: a Node script with the repo's `@playwright/test` chromium (no Google Chrome installed; the Playwright MCP needs Chrome). Script and PNGs in the scratchpad, never in the worktree
- widths: 1440 and 1024 (desktop only, brief); themes: light and dark (`colorScheme` option)
- entry URL: `http://localhost:<port>/` on demo data (see "Prototype: host"); demo Cards cover every waiting kind (`src/core/fixtures.ts`)

## Prototype

- host: `TANDEM_SOURCE=fixture TANDEM_PORT=<port> TANDEM_WEB_PORT=<port+100> npm run dev`, then `http://localhost:<port+100>/?variant=<key>` (HMR); demo data, fake Push
- switcher: `src/web/prototype/Switcher.tsx`, created on the first proto branch (fixed bottom pill, ← key →, updates `?variant=`); not on main
- branch: `proto/<n>-<slug>`, own worktree, never merged
- share: the local URL and the start command; when a preview deploy is asked for, `scripts/deploy-preview.sh proto-<n>` (or `pr-<n>`): builds the static demo and publishes it under `/tandem/<name>/` on gh-pages (demo data only, runs in the page)
- data: fixtures only (`src/core/fixtures.ts`); extend them on the proto branch when a variant needs more states; numbers stay unique (unit-tested). Fixture moves live in the dev server's memory: `curl -X POST localhost:<port>/api/fixture/reset` (or a restart) before each screenshot
- look (Build's Look comment): `Preview:` is the local start command plus URL; `Path:` the route and query

## Canvas

none

## Risk areas

- `src/core/contract.ts` and `src/core/card.ts`: what Tandem reads from and writes to GitHub as the user (a wrong marker or comment shape breaks the agents)
- `src/server/github.ts`, `src/server/board.ts`: sync, rate limits, cache
- `src/server/push.ts`: Orca CLI calls
- `src/core/config.ts`: Phase mapping defaults

## Branches

- name: `<type>/<n>-<kebab-slug>`, type `fix|feat|test|docs|chore`
- worktree notes: run `npm ci` in a new worktree (no symlinked node_modules). In an EnterWorktree session the shell refuses compound commands (heredocs, inline scripts, pipes or loops around `git`/`gh`): one plain command per call, scripts and long bodies as files in the scratchpad

## Verification

- gate command: `npm run verify` (typecheck, vitest, build, Playwright E2E on the built app with demo data)
- E2E port: `E2E_PORT=<port> npm run e2e`; output outside the worktree: `E2E_OUT=<scratchpad>/e2e`
- unit tests next to the code (`*.test.ts`); E2E in `e2e/`
- E2E shares one fixture server, reset before every test (`e2e/fixtures.ts` auto-fixture → `POST /api/fixture/reset`, fixture mode only): specs import `test`/`expect` from `./fixtures.ts` (`npm run check:e2e-reset`), start from boot-state demo data and may change any Card; new demo Cards go in `src/core/fixtures.ts` (numbers are unit-tested unique); `--repeat-each` is safe on any test with `--workers=1` only (several workers reset the one server under each other: every test that writes fails at random)
- E2E intercepts (`page.route`) go in before `page.goto`: one registered a few ms before the key or click that sends is not always in force yet, and the write reaches the server
- anything that changes what Tandem writes to GitHub: a unit test asserting the exact comment text and that `parseMarker` returns null for it

## Pull requests

- screenshots: attached to the PR body via `gh pr comment --attach` or uploaded to the issue; never committed
- required in body: `Closes #<n>`, ACs as a checklist with evidence, `/impeccable audit` result for UI PRs

## Decisions

- one-way (ask the user): a Design round; reversing a recorded UX decision; changing what Tandem writes to GitHub (comment shapes, labels) beyond the agent-workflow contract; anything that writes to repos other than through the developer's explicit action
- explicitly two-way: internal structure, client state shape, API routes, test layout
- digest cap: 2h

## Orchestration

- runner: Orca; max workers: 3
- executable facts: `.claude/issue-workflow.sh`
- merge gate: `npm run verify` in `merge-pr.sh prep`; no CI

## Retro

- running log: `.claude/retro-log.md`
- context files: `~/.claude/CLAUDE.md`, `CLAUDE.md`, this profile, the agent-workflow skills
- edits land: project facts here or in CLAUDE.md, committed on the PR branch or directly on main for docs-only changes
