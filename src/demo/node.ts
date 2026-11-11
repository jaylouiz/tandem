// The static demo runs Tandem's own server code (API, Board, fixture source) inside the page: there is no Node there.
// `vite.demo.config.ts` points every `node:*` import of that code at this file. Demo data keeps its state in memory
// (`Store` with `memory: true`), so the file system is never asked for anything but the one coordination log below.
import log112 from "../../e2e/logs/acme/app/112.md?raw";

const missing = (what: string) => new Error(`${what}: not available in the static demo`);

// node:fs
export const readFileSync = (path: string): string => {
  throw missing(path);
};
export const writeFileSync = () => {};
export const mkdirSync = () => {};
export const renameSync = () => {};
export const existsSync = () => false;

// node:fs/promises
export const readFile = async (path: string): Promise<string> => {
  if (path.endsWith("acme/app/112.md")) return log112;
  throw missing(path);
};
export const stat = async (path: string): Promise<never> => {
  throw missing(path);
};

// node:os, node:path, node:url
export const homedir = () => "/demo";
export const join = (...parts: string[]) => parts.join("/").replace(/\/+/g, "/");
export const dirname = (path: string) => path.replace(/\/[^/]*$/, "");
export const fileURLToPath = (url: string | URL) => String(url);

// node:child_process, node:util (push.ts, notifier.ts: the demo's Push is the FakePusher, nothing is ever executed)
export const execFile = () => {
  throw missing("execFile");
};
export const promisify = <T>(fn: T) => fn;
