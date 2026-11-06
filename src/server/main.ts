// Entry point: `npm start` (built) or `npm run dev:server`. Binds to 127.0.0.1 only.
// TANDEM_SOURCE=fixture serves demo data with a fake Push (dev, screenshots, E2E).
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Board } from "./board.ts";
import { createApp } from "./app.ts";
import { localAccess } from "./guard.ts";
import { FixtureSource, fixtureActivity, fixtureReset } from "./fixture.ts";
import { GitHubSource } from "./github.ts";
import { macSend, Notifier, PageClients } from "./notifier.ts";
import { FakePusher, OrcaPusher } from "./push.ts";
import { Store } from "./store.ts";
import { VersionCheck } from "./version.ts";

const fixture = process.env.TANDEM_SOURCE === "fixture";
const port = Number(process.env.TANDEM_PORT ?? 4317);
// `npm run dev` sets TANDEM_DEV=1: the Vite page (its own port) then may write through Vite's /api proxy
const devWebPort = process.env.TANDEM_DEV === "1" ? Number(process.env.TANDEM_WEB_PORT ?? 5317) : undefined;

const source = fixture ? new FixtureSource() : new GitHubSource();
const defaults = fixture ? { repos: await source.listRepos() } : {};
const store = new Store(defaults, { memory: fixture }); // fixture runs never touch ~/.tandem
const pusher = fixture ? new FakePusher(new Set(process.env.TANDEM_FAKE_COORDINATOR === "0" ? [] : ["acme/app"])) : new OrcaPusher();

const board = new Board(source, store, pusher, { pollMs: fixture ? 1000 : 15_000, persist: !fixture, activity: fixture ? async () => fixtureActivity() : undefined });
const pages = new PageClients();
const version = fixture ? undefined : new VersionCheck();
// Fixture mode only: POST /api/fixture/reset puts the demo data and local state back to boot state (E2E runs it before every test).
const reset =
  fixture && source instanceof FixtureSource && pusher instanceof FakePusher
    ? fixtureReset({ source, store, pusher, board, defaults })
    : undefined;
const app = createApp({ board, source, store, pusher, pages, version, reset, access: localAccess(port, devWebPort) });

// Desktop notifications when no page raises them (never for demo data, or with TANDEM_NOTIFY=0).
if (!fixture && process.env.TANDEM_NOTIFY !== "0" && process.platform === "darwin") {
  new Notifier(board, pages, macSend(), `http://127.0.0.1:${port}/`).start();
}

// Built web app (npm run build), served from the same origin.
const webDir = join(dirname(fileURLToPath(import.meta.url)), "../../web");
if (existsSync(webDir)) {
  app.use("/*", serveStatic({ root: webDir }));
  app.get("*", serveStatic({ path: join(webDir, "index.html") }));
}

serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => {
  console.log(`Tandem on http://127.0.0.1:${port} (${source.kind})`);
});
void board.start();
