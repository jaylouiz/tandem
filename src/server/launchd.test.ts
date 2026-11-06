import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { install, LABEL, mainJs, makeRun, plistPath, renderPlist, status, uninstall, update, type Ctx, type Run } from "./launchd.ts";

let home: string;
let root: string;
let calls: string[];
let isLoaded: boolean;
let out: string[];

function ctx(over: Partial<Ctx> = {}, fail: string[] = []): Ctx {
  const run: Run = async (cmd, args) => {
    const line = `${cmd} ${args.join(" ")}`;
    calls.push(line);
    if (line.startsWith("launchctl print")) return { code: isLoaded ? 0 : 113, stdout: "" };
    if (line.startsWith("launchctl bootstrap")) isLoaded = true;
    if (line.startsWith("launchctl bootout")) isLoaded = false;
    if (line.startsWith("git status")) return { code: 0, stdout: "" };
    return { code: fail.some((f) => line.startsWith(f)) ? 1 : 0, stdout: "" };
  };
  return { home, uid: 501, node: "/opt/node/bin/node", root, path: "/opt/homebrew/bin:/usr/bin", port: "4317", dryRun: false, run, log: (l) => out.push(l), ...over };
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tandem-home-"));
  root = mkdtempSync(join(tmpdir(), "tandem-root-"));
  mkdirSync(join(root, "dist/server/server"), { recursive: true });
  writeFileSync(mainJs(root), "");
  writeFileSync(join(root, "package-lock.json"), "{}");
  calls = [];
  out = [];
  isLoaded = false;
});

describe("renderPlist", () => {
  it("runs the built server at load, keeps it alive, with the install-time PATH and a log file", () => {
    const p = renderPlist(ctx());
    expect(p).toContain(`<string>${LABEL}</string>`);
    expect(p).toContain(`<string>/opt/node/bin/node</string>`);
    expect(p).toContain(`<string>${mainJs(root)}</string>`);
    expect(p).toContain("<key>PATH</key><string>/opt/homebrew/bin:/usr/bin</string>");
    expect(p).toContain("<key>TANDEM_PORT</key><string>4317</string>");
    expect(p).toMatch(/<key>RunAtLoad<\/key><true\/>/);
    expect(p).toMatch(/<key>KeepAlive<\/key><true\/>/);
    expect(p).toContain(join(home, ".tandem", "server.log"));
  });
});

describe("install / uninstall", () => {
  it("installs into HOME, then is idempotent", async () => {
    await install(ctx());
    expect(readFileSync(plistPath(home), "utf8")).toBe(renderPlist(ctx()));
    expect(calls.filter((c) => c.startsWith("launchctl bootstrap"))).toEqual([`launchctl bootstrap gui/501 ${plistPath(home)}`]);
    await install(ctx());
    expect(calls.filter((c) => c.startsWith("launchctl bootstrap"))).toHaveLength(1);
    expect(out.at(-1)).toMatch(/already installed/);
  });

  it("re-bootstraps when the plist changed", async () => {
    await install(ctx());
    await install(ctx({ port: "4401" }));
    expect(calls.some((c) => c.startsWith("launchctl bootout"))).toBe(true);
    expect(readFileSync(plistPath(home), "utf8")).toContain("4401");
  });

  it("refuses without a build", async () => {
    await expect(install(ctx({ root: home }))).rejects.toThrow(/npm run build/);
  });

  it("uninstalls and is idempotent", async () => {
    await install(ctx());
    await uninstall(ctx());
    expect(existsSync(plistPath(home))).toBe(false);
    expect(calls.some((c) => c.startsWith("launchctl bootout"))).toBe(true);
    await uninstall(ctx());
    expect(out.at(-1)).toMatch(/already uninstalled/);
  });

  it("--dry-run changes nothing", async () => {
    await install(ctx({ dryRun: true, run: makeRun(true, (l) => out.push(l)) }));
    expect(existsSync(plistPath(home))).toBe(false);
    expect(out.join("\n")).toContain("[dry-run] write");
    expect(out.join("\n")).toContain(`[dry-run] launchctl bootstrap gui/${501} ${plistPath(home)}`);
  });

  it("status reports installed, running and the port from the plist", async () => {
    await install(ctx({ port: "4401" }));
    out = [];
    await status(ctx(), async (p) => p === "4401");
    expect(out).toEqual(["installed: yes", "running:   yes (launchd)", "port:      4401 (answering)", `log:       ${join(home, ".tandem", "server.log")}`]);
  });
});

describe("update", () => {
  it("pulls, builds and restarts the installed agent", async () => {
    await install(ctx());
    calls = [];
    await update(ctx());
    expect(calls.filter((c) => !c.startsWith("launchctl print"))).toEqual(["git status --porcelain", "git pull --ff-only", "npm run build", `launchctl kickstart -k gui/501/${LABEL}`]);
  });

  it("refuses a dirty tree", async () => {
    const c = ctx();
    const run: Run = async (cmd, args) => ({ code: 0, stdout: cmd === "git" && args[0] === "status" ? " M x.ts\n" : "" });
    await expect(update({ ...c, run })).rejects.toThrow(/uncommitted/);
  });

  it("--dry-run plans every step without running mutating ones", async () => {
    await update(ctx({ dryRun: true, run: makeRun(true, (l) => out.push(l)) }));
    const dry = out.filter((l) => l.startsWith("[dry-run]"));
    expect(dry).toEqual(["[dry-run] git pull --ff-only", "[dry-run] npm ci", "[dry-run] npm run build"]);
  });
});

describe("failures say why", () => {
  it("makeRun hands back stderr, and the error names its last line", async () => {
    const r = await makeRun(false, () => {})("node", ["-e", "console.error('first\\nEIO: boom');process.exit(5)"]);
    expect(r).toMatchObject({ code: 5, stderr: "first\nEIO: boom\n" });
    const run: Run = async (cmd, args) => (`${cmd} ${args.join(" ")}`.startsWith("npm run build") ? { code: 1, stdout: "", stderr: "tsc: error TS2304\n" } : { code: 0, stdout: "" });
    await expect(update(ctx({ run }))).rejects.toThrow("npm run build failed: tsc: error TS2304");
  });
});
