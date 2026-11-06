import { expect, test, type Page } from "./fixtures.ts";

// The URL reflects view, open Card, tab and Repo filter (#48). Read-only: it opens Cards of the demo
// data (blockers it picks from the snapshot; Board Card 107; the unseen Look 108) and changes nothing on any of them.
const K = "acme/app";
const url = (page: Page) => new URL(page.url()).pathname + new URL(page.url()).search;
const detail = (page: Page) => page.getByTestId("detail");
const loaded = (page: Page) => expect(page.getByTestId("agents-line")).toContainText(/\d+ working/);
const sidebar = (page: Page, name: string) => page.getByRole("navigation", { name: "Views" }).getByRole("button", { name: new RegExp(`^${name}`) });
const row = (page: Page, n: number) => page.locator(`.qrow[data-card="${K}#${n}"]`);
/** Numbers of app Cards that still wait on the developer, in no particular order. */
const blockers = async (page: Page): Promise<number[]> => {
  const snap = await (await page.request.get("/api/board")).json();
  return snap.cards.filter((c: { waiting: unknown; repo: string }) => c.waiting && c.repo === K).map((c: { number: number }) => c.number);
};
const card = (page: Page, n: number) => page.locator(`.card[data-card="${K}#${n}"]`);

test("the URL follows view, Card, tab and filter; closing the Card removes its segment", async ({ page }) => {
  const [b] = await blockers(page);
  await page.goto("/");
  await loaded(page);
  await expect.poll(() => url(page)).toBe("/waiting"); // `/` ends on a valid URL
  await row(page, b!).click();
  await expect.poll(() => url(page)).toBe(`/waiting/${K}/${b}`);
  await page.getByRole("tab", { name: "Activity" }).click();
  await expect.poll(() => url(page)).toBe(`/waiting/${K}/${b}?tab=activity`);
  await page.getByRole("tab", { name: "Now" }).click();
  await expect.poll(() => url(page)).toBe(`/waiting/${K}/${b}`);
  await sidebar(page, "Board").click();
  await expect.poll(() => url(page)).toBe("/board");
  await card(page, 107).click();
  await page.getByRole("tab", { name: "Issue" }).click();
  await expect.poll(() => url(page)).toBe(`/board/${K}/107?tab=issue`);
  await page.getByRole("group", { name: "Repos" }).getByRole("button", { name: /^app/ }).click();
  await expect.poll(() => url(page)).toBe(`/board/${K}/107?tab=issue&repo=${K}`);
  await page.keyboard.press("Escape");
  await expect.poll(() => url(page)).toBe(`/board?repo=${K}`);
  await sidebar(page, "Wayfinder maps").click();
  await expect.poll(() => url(page)).toBe(`/maps?repo=${K}`);
  await sidebar(page, "Settings").click();
  await expect.poll(() => url(page)).toBe(`/settings?repo=${K}`);
});

test("a reload and a pasted link restore view, Card, tab and filter; the pane is open once the Board shows", async ({ page, context }) => {
  const link = `/board/${K}/107?tab=decided&repo=${K}`;
  await page.goto(link);
  await expect(detail(page)).toHaveAttribute("aria-label", `Card ${K}#107`);
  await expect(page.getByRole("tab", { name: "Decided" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: /Repo filter/ })).toBeVisible();
  expect(url(page)).toBe(link);
  await page.reload();
  await expect(detail(page)).toHaveAttribute("aria-label", `Card ${K}#107`);
  expect(url(page)).toBe(link);
  const fresh = await context.newPage();
  await fresh.goto(link);
  await expect(detail(fresh)).toHaveAttribute("aria-label", `Card ${K}#107`);
  await expect(fresh.getByRole("tab", { name: "Decided" })).toHaveAttribute("aria-selected", "true");
  const [b] = await blockers(page);
  await fresh.goto(`/waiting/${K}/${b}`);
  await expect(detail(fresh)).toHaveAttribute("aria-label", `Card ${K}#${b}`);
  await expect(row(fresh, b!)).toHaveAttribute("aria-selected", "true");
});

test("Back and Forward walk view, Card, Card and tab; j/k and tab switches add no stop", async ({ page }) => {
  await page.goto("/");
  await loaded(page);
  // the first rows of the list are blockers (a Look row opened by j would be marked Seen)
  const rows = page.getByTestId("waiting-list").locator('.qrow:not([data-kind="look"])');
  await rows.nth(0).click();
  await page.keyboard.press("j"); // next Card: replaces the entry
  await page.getByRole("tab", { name: "Decided" }).click(); // replaces too
  await expect.poll(() => url(page)).toMatch(/^\/waiting\/acme\/[^/]+\/\d+\?tab=decided$/);
  const second = url(page);
  await rows.nth(2).click(); // a pointer open pushes
  await expect.poll(() => url(page)).not.toBe(second);
  const third = url(page);
  expect(third).toMatch(/^\/waiting\/acme\/[^/]+\/\d+$/);
  await sidebar(page, "Board").click();
  await expect.poll(() => url(page)).toBe("/board");
  await page.goBack();
  await expect.poll(() => url(page)).toBe(third);
  await expect(detail(page)).toHaveAttribute("aria-label", new RegExp(`^Card ${third.split("/").slice(2).join("/").replace(/\/(\d+)$/, "#$1")}$`));
  await page.goBack(); // not the first Card, not the j step: the entry before this one is the Card j and the tab left behind
  await expect.poll(() => url(page)).toBe(second);
  await expect(page.getByRole("tab", { name: "Decided" })).toHaveAttribute("aria-selected", "true");
  await page.goForward();
  await expect.poll(() => url(page)).toBe(third);
  await page.goForward();
  await expect.poll(() => url(page)).toBe("/board");
  await expect(page.getByTestId("board")).toBeVisible();
  await expect(detail(page)).toHaveCount(0);
});

test("a Card that is not on the Board closes with a notice and does not add a Back stop", async ({ page }) => {
  await page.goto("/waiting");
  await loaded(page);
  await page.goto(`/board/${K}/99999`);
  await expect(page.getByTestId("toast").filter({ hasText: `${K}#99999 is not on the Board` })).toBeVisible();
  await expect(detail(page)).toHaveCount(0);
  expect(url(page)).toBe("/board");
  await page.goBack();
  await expect.poll(() => url(page)).toBe("/waiting");
  // a repo that is not on the Board at all
  await page.goto("/board/nobody/nothing/1");
  await expect(page.getByTestId("toast").filter({ hasText: "nobody/nothing#1 is not on the Board" })).toBeVisible();
});

test("/, a trailing slash and an unknown path end on a valid URL without an extra Back stop", async ({ page }) => {
  const stops = () => page.evaluate(() => history.length);
  await page.goto("/waiting");
  let seen = await stops();
  for (const [path, valid] of [["/", "/waiting"], ["/waiting/", "/waiting"], ["/nowhere/at/all", "/waiting"], ["/board/", "/board"], ["/", "/board"]] as const) {
    await page.goto(path);
    await expect.poll(() => url(page)).toBe(valid); // `/` follows the view the page last showed
    expect(await stops()).toBe(seen + 1); // the navigation itself is the one entry; the fix-up rewrote it
    seen += 1;
  }
});

test("restoring a link never marks a Look Seen or writes to GitHub", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (r) => r.method() !== "GET" && writes.push(`${r.method()} ${r.url()}`));
  await page.goto(`/waiting/${K}/108`);
  await expect(detail(page)).toHaveAttribute("aria-label", `Card ${K}#108`);
  await page.reload();
  await expect(detail(page)).toHaveAttribute("aria-label", `Card ${K}#108`);
  await sidebar(page, "Board").click();
  await page.goBack();
  await expect(detail(page)).toHaveAttribute("aria-label", `Card ${K}#108`);
  expect(writes).toEqual([]);
  const snap = await (await page.request.get("/api/board")).json();
  expect(snap.cards.find((c: { key: string }) => c.key === `${K}#108`).seenAt).toBeNull();
});

test("an Agent overlay row opens its Card on Activity in the view the developer is in", async ({ page }) => {
  await page.goto("/board");
  await loaded(page);
  await page.getByTestId("agents-line").click();
  const first = page.getByRole("dialog", { name: "Agent activity" }).locator(".arow").first();
  await expect(first).toBeVisible();
  await first.click();
  await expect(page.getByTestId("board")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Activity" })).toHaveAttribute("aria-selected", "true");
  expect(url(page)).toMatch(/^\/board\/acme\/[^/]+\/\d+\?tab=activity$/);
  // from Settings there is no Card pane: it goes to Waiting on me
  await sidebar(page, "Settings").click();
  await page.getByTestId("agents-line").click();
  await page.getByRole("dialog", { name: "Agent activity" }).locator(".arow").first().click();
  await expect.poll(() => url(page)).toMatch(/^\/waiting\/acme\/[^/]+\/\d+\?tab=activity$/);
});

test("a notification opens its Card by URL in Waiting on me", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __notes: { onclick: (() => void) | null }[] };
    w.__notes = [];
    class FakeNotification {
      static permission = "granted";
      onclick: (() => void) | null = null;
      constructor() {
        w.__notes.push(this);
      }
    }
    Object.defineProperty(window, "Notification", { value: FakeNotification });
  });
  const snap = await (await page.request.get("/api/board")).json();
  const target = snap.cards.find((c: { waiting: unknown; repo: string }) => c.waiting && c.repo === K);
  const before = { ...snap, cards: snap.cards.filter((c: { key: string }) => c.key !== target.key) };
  let full = false;
  await page.route("**/api/events*", (route) => route.fulfill({ contentType: "text/event-stream", body: `retry: 200\nevent: board\ndata: ${JSON.stringify(full ? snap : before)}\n\n` }));
  await page.goto("/board");
  await expect(page.getByTestId("board")).toBeVisible();
  full = true;
  await expect.poll(() => page.evaluate(() => (window as unknown as { __notes: unknown[] }).__notes.length)).toBeGreaterThan(0);
  await page.evaluate(() => (window as unknown as { __notes: { onclick: () => void }[] }).__notes[0]!.onclick());
  await expect.poll(() => url(page)).toBe(`/waiting/${K}/${target.number}`);
  await expect(detail(page)).toHaveAttribute("aria-label", `Card ${target.key}`);
});

test("each view remembers its scroll position while the page lives", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 420 });
  await page.goto("/board");
  await loaded(page);
  const scroller = page.locator(".scroll");
  await scroller.evaluate((el) => (el.scrollTop = 150));
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
  const board = await scroller.evaluate((el) => el.scrollTop);
  await sidebar(page, "Waiting on me").click();
  const list = page.getByTestId("waiting-list");
  await expect(list).toBeVisible();
  await list.evaluate((el) => (el.scrollTop = 120));
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(80);
  const waiting = await list.evaluate((el) => el.scrollTop);
  await sidebar(page, "Wayfinder maps").click();
  await expect.poll(() => page.locator(".scroll").evaluate((el) => el.scrollTop)).toBe(0);
  await sidebar(page, "Board").click();
  await expect.poll(() => page.locator(".scroll").evaluate((el) => el.scrollTop)).toBe(board);
  await sidebar(page, "Waiting on me").click();
  await expect.poll(() => page.getByTestId("waiting-list").evaluate((el) => el.scrollTop)).toBe(waiting);
});
