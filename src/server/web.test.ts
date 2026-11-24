import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { cacheControl, IMMUTABLE, REVALIDATE, serveWeb } from "./web.ts";

function webApp() {
  const dir = mkdtempSync(join(tmpdir(), "tandem-web-"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>Tandem</title>");
  writeFileSync(join(dir, "manifest.webmanifest"), "{}");
  writeFileSync(join(dir, "assets", "index-abc123.js"), "console.log(1)");
  const app = new Hono();
  serveWeb(app, dir);
  return app;
}

describe("serving the built web app (#24)", () => {
  it("revalidates the page and caches the hashed assets for good", async () => {
    const app = webApp();
    for (const path of ["/", "/index.html", "/board/acme/app/184", "/manifest.webmanifest"]) {
      const res = await app.request(path);
      expect(res.status, path).toBe(200);
      expect(res.headers.get("cache-control"), path).toBe(REVALIDATE);
    }
    const asset = await app.request("/assets/index-abc123.js");
    expect(asset.status).toBe(200);
    expect(asset.headers.get("cache-control")).toBe(IMMUTABLE);
  });

  it("never caches the page for good, not even as the fallback for a missing asset", async () => {
    const res = await webApp().request("/assets/index-gone.js");
    expect(res.headers.get("content-type")).toMatch(/^text\/html/);
    expect(res.headers.get("cache-control")).toBe(REVALIDATE);
  });

  it("leaves the API alone", async () => {
    const app = new Hono();
    app.get("/api/board", (c) => c.json({}));
    serveWeb(app, mkdtempSync(join(tmpdir(), "tandem-web-")));
    expect((await app.request("/api/board")).headers.get("cache-control")).toBeNull();
  });

  it("treats only the top-level assets folder as hashed", () => {
    expect(cacheControl("/assets/x.js", "text/javascript")).toBe(IMMUTABLE);
    expect(cacheControl("/index.html", "text/html")).toBe(REVALIDATE);
    expect(cacheControl("/icons/assets/a.png", "image/png")).toBe(REVALIDATE);
  });
});
