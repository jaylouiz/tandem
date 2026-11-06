import { expect, test, type Page } from "./fixtures.ts";

// Drag and drop (#49): the targets match the dragged set, and the Board scrolls while a drag is held at its edge.
// Read-only on the fixture data: every drag here is cancelled with Esc, or released on a column that refuses it.
const card = (page: Page, n: number) => page.locator(`[data-card="acme/app#${n}"]`);
const toBoard = async (page: Page) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await expect(page.getByTestId("board")).toBeVisible();
};
const centre = async (loc: ReturnType<Page["locator"]>) => {
  const b = (await loc.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
/** Press on the Card and move a little past the drag threshold. */
const pickUp = async (page: Page, n: number | string) => {
  const target = typeof n === "number" ? card(page, n) : page.getByTestId("column-Inbox").locator(".card").first();
  await target.scrollIntoViewIfNeeded(); // the one wanted can sit below the fold
  const c = await centre(target);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 12, c.y + 12, { steps: 3 });
  await expect(page.getByTestId("drag-ghost")).toBeVisible();
  return c;
};
const scrollPos = (page: Page) => page.evaluate(() => ({ left: document.querySelector(".scroll")!.scrollLeft, top: document.querySelector(".scroll")!.scrollTop }));
const area = (page: Page) =>
  page.evaluate(() => {
    const r = document.querySelector(".scroll")!.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  });
/** Cancel the drag (Esc), let go, and check the Board no longer scrolls with the pointer still at the edge. */
const release = async (page: Page) => {
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await settles(page);
};
/** The scroll position stays where it is for 250 ms. */
const settles = async (page: Page) => {
  const a = await scrollPos(page);
  await page.waitForTimeout(250);
  expect(await scrollPos(page)).toEqual(a);
};

test("targets (#49): a Card that cannot move has no valid column, and the column says why", async ({ page }) => {
  await toBoard(page);
  await pickUp(page, 127); // Build
  for (const phase of ["Inbox", "Backlog"]) {
    const col = page.getByTestId(`column-${phase}`);
    await page.mouse.move((await centre(col)).x, 400, { steps: 4 });
    await expect(col).toHaveAttribute("data-drop", "no");
    await expect(page.getByTestId("drop-note")).toHaveText("Not applicable: Build");
    await expect(page.getByTestId("drag-ghost")).toHaveAttribute("data-refused", "true");
  }
  await page.mouse.move((await centre(page.getByTestId("column-Done"))).x, 400, { steps: 4 });
  await expect(page.getByTestId("drop-note")).toHaveText("Done follows the merged PR");
  // released on a refusing column: nothing moves and the notice gives the same reason the column showed
  await page.mouse.move((await centre(page.getByTestId("column-Backlog"))).x, 400, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId("toast").filter({ hasText: "Not applicable: Build" })).toBeVisible();
  await expect(page.locator("[data-drop]")).toHaveCount(0);
  // a Build Card released over Build (where it already is) still gets the column's refusal
  await pickUp(page, 127);
  await page.mouse.move((await centre(page.getByTestId("column-Build"))).x, 400, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId("toast").filter({ hasText: "Agents move Cards here: use Hand to agent" })).toBeVisible();
});

test("targets (#49): the set decides: a fog Card cannot go to Backlog, its own column is no target, a movable Card has one", async ({ page }) => {
  await toBoard(page);
  const inbox = page.getByTestId("column-Inbox");
  const backlog = page.getByTestId("column-Backlog");
  await pickUp(page, 116); // Inbox, needs wayfinder
  await page.mouse.move((await centre(backlog)).x, 400, { steps: 4 });
  await expect(backlog).toHaveAttribute("data-drop", "no");
  await expect(page.getByTestId("drop-note")).toHaveText("Not applicable: needs wayfinder");
  await page.mouse.move((await centre(inbox)).x, 400, { steps: 4 });
  await expect(inbox).toHaveAttribute("data-drop", "no");
  await expect(page.getByTestId("drop-note")).toHaveText("Already in Inbox");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("drag-ghost")).toHaveCount(0);
  await expect(page.locator("[data-drop]")).toHaveCount(0);
  await pickUp(page, 150);
  await expect(backlog).toHaveAttribute("data-drop", "ok");
  await page.mouse.move((await centre(backlog)).x, 400, { steps: 4 });
  await expect(backlog).toHaveAttribute("data-drop", "over");
  await expect(page.getByTestId("drop-note")).toHaveText("Move 1 Card here");
  await expect(page.getByTestId("drag-ghost")).not.toHaveAttribute("data-refused", "true");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(inbox.locator('[data-card="acme/app#150"]')).toHaveCount(1); // cancelled: nothing moved
});

test("auto-scroll (#49): held at the bottom and top edge the Board scrolls vertically, and stops when the pointer leaves or the drag ends", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 420 });
  await toBoard(page);
  expect((await scrollPos(page)).top).toBe(0);
  const c = await pickUp(page, "first Inbox Card"); // the first one: 116 may sit below the 420 px fold
  const a = await area(page);
  await page.mouse.move(c.x, a.bottom - 6, { steps: 4 });
  await expect.poll(async () => (await scrollPos(page)).top).toBeGreaterThan(150);
  await page.mouse.move(c.x, (a.top + a.bottom) / 2, { steps: 4 });
  await settles(page);
  const mid = (await scrollPos(page)).top;
  await page.mouse.move(c.x, a.top + 6, { steps: 4 });
  await expect.poll(async () => (await scrollPos(page)).top).toBeLessThan(mid - 100);
  await page.mouse.move(c.x, a.bottom - 6, { steps: 4 });
  await expect.poll(async () => (await scrollPos(page)).top).toBeGreaterThan(mid);
  await release(page);
});

test("auto-scroll (#49): at 1024 px with the Card pane open the Board scrolls sideways, and the column under the still pointer follows", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await toBoard(page);
  await card(page, 116).click();
  await expect(page.getByTestId("detail")).toBeVisible();
  await settles(page);
  const before = (await scrollPos(page)).left;
  const c = await pickUp(page, 116);
  const a = await area(page);
  await page.mouse.move(c.x, 300, { steps: 4 });
  // the column the drop note is in = the one under the pointer (null in a gap between two columns)
  const underPointer = () => page.evaluate(() => document.querySelector(".drop-note")?.closest("[data-column]")?.getAttribute("data-column") ?? null);
  await expect.poll(underPointer).not.toBeNull();
  const over0 = await underPointer();
  await page.mouse.move(a.right - 6, 300, { steps: 4 });
  await expect.poll(async () => (await scrollPos(page)).left).toBeGreaterThan(before + 150);
  // the pointer did not move: the column under it did
  await expect.poll(async () => (await underPointer()) ?? over0).not.toBe(over0);
  await page.mouse.move(a.left + 6, 300, { steps: 4 });
  await expect.poll(async () => (await scrollPos(page)).left).toBeLessThan(before + 20);
  await release(page);
});

test("auto-scroll (#49): grouped by repo it scrolls across the lanes in both axes, under the sticky head row", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 420 });
  await toBoard(page);
  await page.getByTestId("lane-toggle").click();
  await expect(page.getByTestId("board-heads")).toBeVisible();
  await card(page, 116).click();
  await expect(page.getByTestId("detail")).toBeVisible();
  await settles(page);
  const before = await scrollPos(page);
  const c = await pickUp(page, 116);
  const a = await area(page);
  await page.mouse.move(a.right - 6, a.bottom - 6, { steps: 4 });
  await expect.poll(async () => (await scrollPos(page)).top).toBeGreaterThan(before.top + 100);
  await expect.poll(async () => (await scrollPos(page)).left).toBeGreaterThan(before.left + 100);
  // the head row stays at the top of the scroll area and the drop note shows once, in the lane under the pointer
  const head = await page.getByTestId("board-heads").boundingBox();
  expect(Math.abs(head!.y - a.top)).toBeLessThanOrEqual(1);
  await expect(page.getByTestId("drop-note")).toHaveCount(1);
  await page.mouse.move(c.x, a.top + head!.height + 6, { steps: 4 });
  const down = (await scrollPos(page)).top;
  await expect.poll(async () => (await scrollPos(page)).top).toBeLessThan(down - 100);
  await release(page);
});
