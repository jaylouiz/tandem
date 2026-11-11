# Tandem

An opinionated personal kanban board over GitHub issues: see what waits on you across your repos, give Feedback in place (decisions, agent decisions, design rounds, PR approvals, Looks), and Push it to the running [agent-workflow](https://github.com/jaylouiz/agent-workflow) coordinator through Orca.

## Who it's for

Tandem is opinionated. It is built around one developer steering coding agents that run the [agent-workflow](https://github.com/jaylouiz/agent-workflow) skills (Design, Specify, Build, coordinated by an orchestrator) in [Orca](https://github.com/stablyai/orca). It reads and writes the exact comment shapes those skills use. Without them it is still a board over your GitHub issues, but most of Feedback and all of Push assume that setup.

## Requirements

- macOS only: it opens the browser with `open`, keeps running as a `launchd` user agent, and notifies through `terminal-notifier` or `osascript`
- Node.js 22.12 or newer
- the GitHub CLI `gh`, logged in (`gh auth login`): Tandem reads and writes issues with your token
- a git checkout of this repo: `tandem update` pulls and rebuilds it, and the "Update pending" chip compares the running build with `HEAD`
- for Push: the [Orca](https://github.com/stablyai/orca) app and its `orca` CLI on the `PATH`

## Run

```sh
npm ci
npm run build
bin/tandem.js            # http://127.0.0.1:4317, opens the browser
```

Needs `gh auth login` (Tandem acts as you) and, for Push, Orca with its `orca` CLI. Choose your repos in Settings.

## Keep it running

```sh
bin/tandem.js install     # launchd user agent: starts at login, restarts on a crash, log in ~/.tandem/server.log
bin/tandem.js status      # installed, running, port
bin/tandem.js update      # git pull --ff-only, npm ci if the lockfile changed, npm run build, restart the agent
bin/tandem.js uninstall
```

`install`, `uninstall` and `update` take `--dry-run` (print, change nothing). The agent runs with the `PATH` of the shell that installed it, so `gh`, `orca` and `terminal-notifier` are found. After `bin/tandem.js` itself: with the agent running it only opens the Board. Port: `TANDEM_PORT` at install time.

An "Update pending" chip appears in the Board when the checkout has commits that are not built, or a build that is not running yet; `tandem update` fixes both.

## App window and notifications

- Chrome: open Tandem, menu → "Cast, save and share" → "Install page as app". Safari: File → "Add to Dock". Tandem then opens in its own window.
- With a Tandem page open and notifications allowed ("Enable notifications" in the sidebar), the page notifies. With no such page the server notifies through `terminal-notifier` (click opens the Board; `brew install terminal-notifier`) or, if absent, `osascript`. Never both. `TANDEM_NOTIFY=0` switches the server's notifications off.

Demo data without GitHub: `TANDEM_SOURCE=fixture npm run dev`, then http://localhost:5317.

A static demo that runs entirely in the browser (the API over demo data lives in the page, nothing is sent anywhere): `npm run build:demo` writes `dist/demo`, which any static host can serve when it rewrites every path to `/index.html` (a `vercel.json` is included).

## Keys

`⌘K` command palette · `f` Focus (Waiting on me, one Card at a time; `j`/`k` or `←`/`→` step, `esc` back to the list) · `j`/`k` move (the open Card follows) · `[` `]` Card tabs (Now, Decided, Activity, Issue) · `1`-`9` pick a choice of the open Feedback, `⌘↵` send it (the next blocker opens) · `esc` back to the list (closes the pane on the Board) · `c` capture an idea · `o` open on GitHub · `x` mark · `g w` Waiting on me · `g b` Board · `g m` maps · `g s` settings · `g a` Agent activity · `←`/`→` in the screenshot gallery. Triage keys (`d s b h a w`, priority `1`-`3`/`0` on Cards without a numbered Feedback) are in the palette.

## Docs

[Brief](docs/brief.md) · [Glossary](GLOSSARY.md) · [ADRs](docs/adr/)

## Security

Tandem is a local, single-user server on `127.0.0.1` that acts with your `gh` token. What it protects against and how to report a vulnerability: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 Julius Wüstefeld.

The bundled font [Inter](https://github.com/rsms/inter) (via `@fontsource-variable/inter`) is © The Inter Project Authors and licensed under the [SIL Open Font License 1.1](https://openfontlicense.org).
