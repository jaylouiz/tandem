// `tandem install | uninstall | status | update`: keep the server and its sync running without a terminal
// as a launchd user agent (ADR 0001). Everything goes through an injectable runner and a HOME, so tests and
// `--dry-run` never touch the real LaunchAgents or launchctl.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const LABEL = "dev.tandem.server";

export interface Run {
  (cmd: string, args: string[], opts?: { cwd?: string; mutates?: boolean }): Promise<{ code: number; stdout: string; stderr?: string }>;
}

/** The last line a failed command wrote to stderr, as a suffix for the error message ("" when it wrote none). */
const why = (r: { stderr?: string }) => {
  const last = (r.stderr ?? "").trim().split("\n").at(-1)?.trim();
  return last ? `: ${last}` : "";
};

export interface Ctx {
  home: string;
  uid: number;
  /** absolute node binary */
  node: string;
  /** repo checkout root */
  root: string;
  path: string;
  port: string;
  dryRun: boolean;
  run: Run;
  log: (line: string) => void;
}

export const plistPath = (home: string) => join(home, "Library", "LaunchAgents", `${LABEL}.plist`);
export const logPath = (home: string) => join(home, ".tandem", "server.log");
export const mainJs = (root: string) => join(root, "dist", "server", "server", "main.js");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function renderPlist(c: Pick<Ctx, "home" | "node" | "root" | "path" | "port">): string {
  const env = { PATH: c.path, TANDEM_PORT: c.port };
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${esc(c.node)}</string>
    <string>${esc(mainJs(c.root))}</string>
  </array>
  <key>WorkingDirectory</key><string>${esc(c.root)}</string>
  <key>EnvironmentVariables</key>
  <dict>
${Object.entries(env)
  .map(([k, v]) => `    <key>${k}</key><string>${esc(v)}</string>`)
  .join("\n")}
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${esc(logPath(c.home))}</string>
  <key>StandardErrorPath</key><string>${esc(logPath(c.home))}</string>
</dict>
</plist>
`;
}

/** Real runner; under --dry-run commands that change something are printed instead of run. */
export function makeRun(dryRun: boolean, log: (l: string) => void): Run {
  return (cmd, args, opts = {}) => {
    if (dryRun && opts.mutates) {
      log(`[dry-run] ${cmd} ${args.join(" ")}`);
      return Promise.resolve({ code: 0, stdout: "" });
    }
    return new Promise((resolve) => execFile(cmd, args, { cwd: opts.cwd, maxBuffer: 16 << 20 }, (e, stdout, stderr) => resolve({ code: e ? ((e as { code?: number }).code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) })));
  };
}

const domain = (c: Ctx) => `gui/${c.uid}`;
const loaded = async (c: Ctx) => (await c.run("launchctl", ["print", `${domain(c)}/${LABEL}`])).code === 0;

export async function install(c: Ctx) {
  if (!existsSync(mainJs(c.root))) throw new Error(`${mainJs(c.root)} not found: run \`npm run build\` first`);
  const file = plistPath(c.home);
  const plist = renderPlist(c);
  const same = existsSync(file) && readFileSync(file, "utf8") === plist;
  if (c.dryRun) {
    c.log(`[dry-run] write ${file}:\n${plist}`);
  } else if (!same) {
    mkdirSync(dirname(file), { recursive: true });
    mkdirSync(dirname(logPath(c.home)), { recursive: true });
    writeFileSync(file, plist);
  }
  if (same && !c.dryRun && (await loaded(c))) return c.log("Tandem is already installed and running.");
  if (await loaded(c)) await c.run("launchctl", ["bootout", `${domain(c)}/${LABEL}`], { mutates: true });
  const r = await c.run("launchctl", ["bootstrap", domain(c), file], { mutates: true });
  if (r.code !== 0) throw new Error(`launchctl bootstrap failed (exit ${r.code}${why(r)}); see \`launchctl print ${domain(c)}/${LABEL}\``);
  c.log(`Installed ${file}. Tandem starts at login on http://127.0.0.1:${c.port}; log: ${logPath(c.home)}`);
}

export async function uninstall(c: Ctx) {
  const file = plistPath(c.home);
  const isLoaded = await loaded(c);
  if (!existsSync(file) && !isLoaded) return c.log("Tandem is already uninstalled.");
  if (isLoaded) await c.run("launchctl", ["bootout", `${domain(c)}/${LABEL}`], { mutates: true });
  if (c.dryRun) c.log(`[dry-run] remove ${file}`);
  else rmSync(file, { force: true });
  c.log("Uninstalled the Tandem launch agent.");
}

export async function status(c: Ctx, probe: (port: string) => Promise<boolean>) {
  const file = plistPath(c.home);
  const installed = existsSync(file);
  const port = installed ? (readFileSync(file, "utf8").match(/<key>TANDEM_PORT<\/key><string>(\d+)</)?.[1] ?? c.port) : c.port;
  const running = installed && (await loaded(c));
  c.log(`installed: ${installed ? "yes" : "no"}`);
  c.log(`running:   ${running ? "yes (launchd)" : "no"}`);
  c.log(`port:      ${port}${(await probe(port)) ? " (answering)" : " (no answer)"}`);
  c.log(`log:       ${logPath(c.home)}`);
}

const sha = (file: string) => (existsSync(file) ? createHash("sha1").update(readFileSync(file)).digest("hex") : "");

/** Pull, rebuild and restart: Tandem runs from a checkout, there is no release channel. */
export async function update(c: Ctx) {
  const git = (args: string[], mutates = false) => c.run("git", args, { cwd: c.root, mutates });
  const dirty = (await git(["status", "--porcelain"])).stdout.trim();
  if (dirty) throw new Error("the checkout has uncommitted changes; commit or stash them first");
  const lock = join(c.root, "package-lock.json");
  const before = sha(lock);
  c.log("1/4 git pull --ff-only");
  const pull = await git(["pull", "--ff-only"], true);
  if (pull.code !== 0) throw new Error(`git pull --ff-only failed (diverged or no upstream)${why(pull)}`);
  if (c.dryRun) c.log("2/4 npm ci, only if the lockfile changed");
  if (c.dryRun || sha(lock) !== before) {
    const ci = await c.run("npm", ["ci"], { cwd: c.root, mutates: true });
    if (ci.code !== 0) throw new Error(`npm ci failed${why(ci)}`);
  } else c.log("2/4 npm ci skipped (lockfile unchanged)");
  c.log("3/4 npm run build");
  const build = await c.run("npm", ["run", "build"], { cwd: c.root, mutates: true });
  if (build.code !== 0) throw new Error(`npm run build failed${why(build)}`);
  if (existsSync(plistPath(c.home)) && (c.dryRun || (await loaded(c)))) {
    c.log("4/4 restarting the launch agent");
    await c.run("launchctl", ["kickstart", "-k", `${domain(c)}/${LABEL}`], { mutates: true });
  } else c.log("4/4 no launch agent installed: restart `tandem` yourself");
}
