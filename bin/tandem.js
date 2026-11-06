#!/usr/bin/env node
// `tandem`            open the Board; start the server first unless one already answers on the port
// `tandem install`    keep the server running as a launchd user agent (also: uninstall, status, update)
// Flags: --no-open (no browser), --dry-run (install, uninstall, update: print, change nothing)
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const port = process.env.TANDEM_PORT ?? "4317";
const url = `http://127.0.0.1:${port}`;
const [cmd] = args.filter((a) => !a.startsWith("--"));

const answering = (p = port) =>
  fetch(`http://127.0.0.1:${p}/api/board`, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok, () => false);

if (["install", "uninstall", "status", "update"].includes(cmd ?? "")) {
  const l = await import("../dist/server/server/launchd.js").catch(() => null);
  if (!l) {
    console.error("Tandem is not built: run `npm run build` first.");
    process.exit(1);
  }
  const dryRun = args.includes("--dry-run");
  const log = (line) => console.log(line);
  const ctx = { home: process.env.HOME ?? homedir(), uid: process.getuid(), node: process.execPath, root, path: [...new Set((process.env.PATH ?? "").split(":").filter(Boolean))].join(":"), port, dryRun, run: l.makeRun(dryRun, log), log };
  try {
    await (cmd === "status" ? l.status(ctx, answering) : l[cmd](ctx));
  } catch (e) {
    console.error(`tandem ${cmd}: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
} else {
  const open = () => {
    if (!args.includes("--no-open")) execFile("open", [url]);
  };
  if (await answering()) {
    console.log(`Tandem already runs on ${url}`);
    open();
  } else {
    process.env.TANDEM_PORT = port;
    await import("../dist/server/server/main.js");
    setTimeout(open, 300);
  }
}
