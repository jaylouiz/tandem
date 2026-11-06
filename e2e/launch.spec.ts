import { expect, test } from "./fixtures.ts";

test("serves a web manifest with icons so Tandem installs as an app window", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "Tandem", display: "standalone", start_url: "/" });
  for (const icon of manifest.icons) expect((await request.get(icon.src)).headers()["content-type"]).toBe("image/png");
});

test("shows no update chip on demo data", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("waiting")).toBeVisible();
  await expect(page.getByTestId("update-pending")).toHaveCount(0);
});

test("shows per-repo progress instead of an empty Board while the first sync runs", async ({ page, request }) => {
  const snap = await (await request.get("/api/board")).json();
  const repos: string[] = snap.repos;
  const sync = Object.fromEntries(repos.map((r, i) => [r, i === 0 ? { at: "2026-11-04T12:00:00Z", error: null, syncing: false } : { at: null, error: null, syncing: true }]));
  const loading = { ...snap, cards: [], sync };
  await page.route("**/api/events*", (route) => route.fulfill({ contentType: "text/event-stream", body: `event: board\ndata: ${JSON.stringify(loading)}\n\n` }));
  await page.goto("/");
  await expect(page.getByTestId("first-sync")).toContainText(`Syncing ${repos[1]}`);
  await expect(page.getByTestId("first-sync")).toContainText(`1 of ${repos.length} repos synced`);
  await expect(page.getByTestId("sync-progress")).toContainText(`Syncing · 1 of ${repos.length} repos`);
});

test("a page that may notify tells the server, so the server stays silent", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL });
  const page = await ctx.newPage();
  // headless Chromium reports "denied"; pretend the developer allowed notifications
  await page.addInitScript(() => Object.defineProperty(Notification, "permission", { get: () => "granted" }));
  const stream = page.waitForRequest((r) => r.url().includes("/api/events"));
  await page.goto("/");
  expect((await stream).url()).toContain("notify=1");
  await ctx.close();
  const plain = await browser.newContext({ baseURL });
  const p2 = await plain.newPage();
  const stream2 = p2.waitForRequest((r) => r.url().includes("/api/events"));
  await p2.goto("/");
  expect((await stream2).url()).not.toContain("notify=1");
  await plain.close();
});

test("a repo filter does not hide a new wait from the page's own notifications", async ({ browser, baseURL, request }) => {
  const snap = await (await request.get("/api/board")).json();
  const target = snap.cards.find((c: { waiting: unknown; repo: string }) => c.waiting);
  const other: string = snap.repos.find((r: string) => r !== target.repo);
  const before = { ...snap, cards: snap.cards.filter((c: { key: string }) => c.key !== target.key) };
  let full = false;
  const ctx = await browser.newContext({ baseURL });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const w = window as unknown as { __notes: string[] };
    w.__notes = [];
    class FakeNotification {
      static permission = "granted";
      onclick: (() => void) | null = null;
      constructor(title: string) {
        w.__notes.push(title);
      }
    }
    Object.defineProperty(window, "Notification", { value: FakeNotification });
  });
  await page.route("**/api/events*", (route) =>
    route.fulfill({ contentType: "text/event-stream", body: `retry: 200\nevent: board\ndata: ${JSON.stringify(full ? snap : before)}\n\n` }),
  );
  await page.goto("/");
  await expect(page.getByTestId("waiting")).toBeVisible();
  await page.getByRole("group", { name: "Repos" }).getByRole("button", { name: new RegExp(`^${other.split("/")[1]}`) }).click();
  full = true; // the next reconnect brings a wait in the repo the filter hides
  const title = `Waiting on you: ${target.repo.split("/")[1]}#${target.number}`;
  await expect.poll(() => page.evaluate(() => (window as unknown as { __notes: string[] }).__notes)).toContain(title);
  await ctx.close();
});
