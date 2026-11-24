// The built web app (npm run build), served from the API's origin. Vite names every file under /assets/ by its content
// hash, so those are cached for good; everything else (index.html, the manifest, the icons) is revalidated on every
// load, so an update (bin/tandem.js update) shows at the next page load instead of a cached index.html pointing at the
// old bundle (#24; Safari's Dock web app cached it heuristically from last-modified).
import { join } from "node:path";
import type { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";

export const IMMUTABLE = "public, max-age=31536000, immutable";
export const REVALIDATE = "no-cache";

// The page (the SPA fallback included, even when it answers a missing /assets/ file) is never cached for good.
export function cacheControl(urlPath: string, contentType: string | null): string {
  return urlPath.startsWith("/assets/") && !contentType?.startsWith("text/html") ? IMMUTABLE : REVALIDATE;
}

export function serveWeb(app: Hono, webDir: string): void {
  // Registered after the API: an API route answers without calling next, so this only sees what is served from webDir.
  app.use("/*", async (c, next) => {
    await next();
    if (c.res.ok) c.res.headers.set("Cache-Control", cacheControl(c.req.path, c.res.headers.get("content-type")));
  });
  app.use("/*", serveStatic({ root: webDir }));
  app.get("*", serveStatic({ path: join(webDir, "index.html") }));
}
