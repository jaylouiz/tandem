# 0002: GitHub sync: ETag change detection, GraphQL delta fetch, rebuildable local cache

Status: accepted, 2026-11-04

## Context

GitHub is the source of truth. Opening the Board and moving between Cards must feel instant across several repos, and rate limits must not degrade the experience. Tandem acts as the developer.

## Decision

- **Identity**: the developer's `gh` login (`gh auth token`). Tandem writes with it, so its comments are indistinguishable from comments typed on GitHub.
- **Change detection**: every 15 s, per opted-in repo, one REST call `GET /repos/{repo}/issues?state=all&sort=updated&per_page=1` with `If-None-Match`. An unchanged repo answers `304`, which costs no rate limit. Comments, label changes and linked PR activity all bump an issue's `updated_at`.
- **Fetch**: on a change, one GraphQL query for the issues updated since the last sync (one minute of overlap), with labels, the last 80 comments, the PRs that close the issue, and the sub-issue `parent`, `assignees` and `blockedBy` (same repo only) that Wayfinder maps need. Wayfinder maps and tickets are derived from this data; they never become Cards. The first sync loads all open issues and those closed within `closedLookbackDays` (60).
- **Push to the UI**: the server keeps the merged data and streams a full Board snapshot over SSE when anything changes. The web app holds no fetching logic of its own, and moving between Cards is local.
- **Writes**: REST. Each write patches the cached issue at once (optimistic), and the next sync confirms it.
- **Cache**: `~/.tandem/cache.json`, rebuildable, so a cold start shows the last Board immediately. It carries a version: a cache written before a sync read more fields (e.g. `parent`) is fetched in full once on the next start.

## Alternatives

- Webhooks: need a public endpoint or a relay. Not local-first.
- GraphQL polling only: costs points on every poll, even when nothing changed.

## Consequences

- An idle Board costs one free `304` per repo every 15 s.
- Threads longer than 80 comments lose their oldest comments. A decision request that old is unlikely; raise the limit if it happens.
- Screenshots on private repos are `user-attachments` URLs that need a browser session. Signed URLs (`bodyHTML`) are a later refinement.
