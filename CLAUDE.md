# Tandem

A personal kanban board over GitHub issues where one developer steers agentic coding and gives Feedback without leaving the Board. What and why: `docs/brief.md`. Vocabulary: `GLOSSARY.md`, used in code, UI copy and issues. Decisions: `docs/adr/`. Workflow profile: `.claude/issue-workflow.md`.

Issue and PR numbers `#n` up to 70 in code, docs and commit history refer to the private archive `jaylouiz/tandem-archive`: `gh issue view <n> -R jaylouiz/tandem-archive`.

## Commands

- `npm run dev`: server (tsx watch) + Vite. Real GitHub needs `gh auth login`. Demo data: `TANDEM_SOURCE=fixture npm run dev`
- ports: `TANDEM_PORT` (API, default 4317), `TANDEM_WEB_PORT` (Vite, default 5317, proxies `/api`). Vite listens on `localhost`, not `127.0.0.1`
- `npm run verify`: typecheck + vitest + build + Playwright E2E (`E2E_PORT`, `E2E_OUT` for the output dir). E2E specs import `test` from `e2e/fixtures.ts`: it resets the fixture server (`POST /api/fixture/reset`, fixture mode only) before every test
- `npm run build:demo`: the static demo in `dist/demo` (web app plus the real API over demo data, in the page; `src/demo/`, `vite.demo.config.ts`). For preview deploys; `tsconfig.demo.json` typechecks it
- `npm run build && npm start` (or `bin/tandem.js`): the built app on one port. `bin/tandem.js install|uninstall|status|update` manage the launchd agent (`--dry-run`; never install for real in tests: temp `HOME`)

## Layout

- `src/core`: pure domain shared by server and web: `contract.ts` (agent-workflow comment markers: read and write), `card.ts` (Phase, Next step, Waiting on me, Look/Seen), `config.ts` (Phase rules), `fixtures.ts` (demo threads in the exact agent-workflow shapes)
- `src/server`: `github.ts` (gh token, ETag poll, GraphQL), `fixture.ts`, `board.ts` (cache + snapshots), `push.ts` (Orca), `notifier.ts` (desktop notifications when no page), `launchd.ts` + `version.ts` (agent, build stamp), `store.ts` (`~/.tandem`), `app.ts` (API + SSE)
- `src/web`: React SPA; `store.ts` (zustand: SSE snapshot + optimistic patches), `route.ts` + `routing.ts` (URL sync, #48), `components/` (`focus/`: the covers of Focus, where an option sends on a click), `feedback/` (what an answer is and how it is sent, shared by the Card pane's panels and Focus), `focus/` (one Focus visit: stage, receipt, its keys), `ui/` (Base UI wrappers, the only importers of `@base-ui/react`; ADR 0005)

## Invariants

- GitHub is the source of truth. Local state is only `~/.tandem/state.json` (repos, Seen, paths, `optedInAt`) and the rebuildable `cache.json`. `TANDEM_HOME` relocates it (tests, smoke runs)
- Tandem writes as the user: comments are **unmarked**. Never write a `<!-- decision-… -->` marker; agents would read it as their own. New comment shapes need a unit test (exact text, `parseMarker` returns null)
- Phase mapping stays configuration (`DEFAULT_WORKFLOW`), never `if (label === …)` in UI code
- Push only through `orca orchestration send` or `orca agent launch` (ADR 0003); never type into terminals
- Web code imports from `src/core` only, never from `src/server` (Node types). `src/demo` is the one place that bundles both: its `node.ts` stands in for every `node:*` import, so server code the demo pulls in may only use what that file exports
- zustand selectors never return a fresh `[]`/`{}` literal (`?? []` re-renders forever while the board is null; it broke three times, #7; `npm run check:selectors` in verify): use a module constant (`NO_REPOS`, `NO_ACTIVITY` in `src/web/store.ts`)
- Demo data images: hex colours only in SVG data URIs (a `)` ends a Markdown image link)
- The API refuses a foreign `Host` and any write without `Content-Type: application/json` plus `X-Tandem: 1` (DNS rebinding, CSRF; `src/server/guard.ts`, SECURITY.md). Web writes go through `call()` in `src/web/store.ts`; E2E writes pass `WRITE` from `e2e/fixtures.ts`
