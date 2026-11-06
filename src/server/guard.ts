// Who may talk to the localhost API. Tandem acts with the developer's gh token, so a page on another site must not
// be able to read the Board (DNS rebinding) or write through it (CSRF). See SECURITY.md.
import type { MiddlewareHandler } from "hono";

export interface Access {
  /** `Host` header values that address this server, e.g. `127.0.0.1:4317` */
  hosts: string[];
  /** `Origin` values a write may come from, e.g. `http://127.0.0.1:4317` */
  origins: string[];
}

/** The API port, plus in dev the Vite port whose proxy forwards `/api` with the page's Origin. */
export function localAccess(port: number, devWebPort?: number): Access {
  const ports = devWebPort ? [port, devWebPort] : [port];
  const hosts = ports.flatMap((p) => [`127.0.0.1:${p}`, `localhost:${p}`]);
  return { hosts, origins: hosts.map((h) => `http://${h}`) };
}

/** The header the web client sends on every write. A cross-site form or `no-cors` fetch cannot set it. */
export const CLIENT_HEADER = "x-tandem";

const SAFE = new Set(["GET", "HEAD"]);

export function guard(access: Access): MiddlewareHandler {
  const hosts = new Set(access.hosts);
  const origins = new Set(access.origins);
  return async (c, next) => {
    // a rebound DNS name reaches 127.0.0.1 with the attacker's host name in Host
    if (!hosts.has(c.req.header("host") ?? "")) return c.json({ error: "forbidden host" }, 403);
    if (!SAFE.has(c.req.method)) {
      const origin = c.req.header("origin");
      if (origin !== undefined && !origins.has(origin)) return c.json({ error: "forbidden origin" }, 403);
      if (c.req.header(CLIENT_HEADER) !== "1") return c.json({ error: `missing ${CLIENT_HEADER} header` }, 403);
      // text/plain and form posts need no preflight; JSON does
      const type = (c.req.header("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
      if (type !== "application/json") return c.json({ error: "content-type must be application/json" }, 415);
    }
    await next();
  };
}

// ---- input checks ----

const NAME = /^[\w.-]+$/;

/** One `owner` or `name` segment of a repo: GitHub's characters, never a path step. */
export const isRepoPart = (s: string) => NAME.test(s) && !s.includes("..");
export const isRepo = (s: unknown): s is string => typeof s === "string" && s.split("/").length === 2 && s.split("/").every(isRepoPart);
export const isIssueNumber = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n > 0;
export const isStringArray = (a: unknown): a is string[] => Array.isArray(a) && a.every((s) => typeof s === "string");
