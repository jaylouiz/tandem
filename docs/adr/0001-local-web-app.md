# 0001: Local web app (Node server + React SPA), not Electron or Tauri

Status: accepted, 2026-11-04

## Context

Tandem runs on the developer's Mac (Push needs the local `orca` CLI) and must feel like Linear: keyboard-first, instant, polished light and dark themes. It also needs desktop notifications. It is built and changed mostly by coding agents, which verify UI with Playwright and screenshots.

## Decision

One Node process (TypeScript, Hono) bound to `127.0.0.1` serves a JSON/SSE API and the built React SPA (Vite, Tailwind v4 for utilities, design tokens as CSS custom properties in `src/web/styles.css`). The developer opens it in the browser, or installs it as a standalone app window (Chrome or Safari "Add to Dock"). Desktop notifications use the Web Notifications API while a page is open, and the server notifies through `terminal-notifier` or `osascript` when none is (it stays silent for a page that announced `notify=1`). `bin/tandem.js` starts the server and opens the Board; `tandem install` keeps the server running as a launchd user agent, and the SPA ships a web manifest so it installs as an app window.

Layout: `src/core` (pure domain: Phases, Cards, the comment contract; shared by server and web), `src/server` (GitHub, Orca, local store, API), `src/web` (UI).

## Alternatives

- **Electron**: native window and notifications, but a heavy runtime and packaging, and agents test it less easily.
- **Tauri**: small binaries, but adds Rust to every build and change.

## Consequences

- Agents run, test and screenshot Tandem like any web app (`TANDEM_SOURCE=fixture` for demo data).
- No app bundle. The launchd agent (issue #6) sits beside the app and does not touch it; a thin native wrapper stays possible (two-way).
- Notifications work with no page open; with a page open the page owns them.
- Tandem runs from a git checkout and is rebuilt on pull (`tandem update`); a build stamp makes a stale build visible.
