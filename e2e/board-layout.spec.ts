import { expect, test, type Page } from "./fixtures.ts";

// Board layout (#50, #36). Read-only on the fixture data: these tests open Cards and flip a browser-side toggle, they write nothing.
const toBoard = async (page: Page) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await expect(page.getByTestId("board")).toBeVisible();
};
const viaPalette = async (page: Page, text: string) => {
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByPlaceholder("Type a command or search Cards…")).toBeFocused();
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
};
/** How far the column's left edge is from the Board scroll area's left edge, less the Board padding (0 = at the left edge). */
const offsetOf = (page: Page, phase: string) =>
  page.evaluate((p) => {
    const sc = document.querySelector(".scroll")!;
    const col = document.querySelector(`.board [data-column="${p}"]`)!;
    const pad = parseFloat(getComputedStyle(document.querySelector(".board")!).paddingLeft);
    return Math.round(col.getBoundingClientRect().left - sc.getBoundingClientRect().left - pad);
  }, phase);
const widths = (page: Page) =>
  page.evaluate(() => ({
    pane: document.querySelector(".pane.aside")?.getBoundingClientRect().width ?? 0,
    scroll: document.querySelector(".scroll")!.getBoundingClientRect().width,
    col: document.querySelector<HTMLElement>(".board [data-column]")!.getBoundingClientRect().width,
  }));

test("narrow window (#50): the pane is 400 px, the open Card's column is at the left edge and follows the selection", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await toBoard(page);
  const before = await widths(page);
  expect(before.pane).toBe(0);
  await viaPalette(page, "Retry policy for sync"); // Build
  await expect(page.getByTestId("detail")).toBeVisible();
  const w = await widths(page);
  expect(Math.round(w.pane)).toBe(400);
  expect(w.col).toBeGreaterThanOrEqual(207); // 208 minimum while a Card is open
  await expect.poll(() => offsetOf(page, "Build")).toBeLessThanOrEqual(2);
  expect(await offsetOf(page, "Build")).toBeGreaterThanOrEqual(-2);
  // a Card in another column: that column takes the left edge (the last columns stop where the scroll ends)
  await viaPalette(page, "Keyboard shortcut for quick add"); // Backlog
  await expect.poll(async () => Math.abs(await offsetOf(page, "Backlog"))).toBeLessThanOrEqual(2);
  // the next column is in view, a neighbour can be glanced at without scrolling (about 0.8-0.9 of it)
  const next = await page.evaluate(() => {
    const sc = document.querySelector(".scroll")!.getBoundingClientRect();
    const c = document.querySelector('.board [data-column="UX Design"]')!.getBoundingClientRect();
    return (sc.right - c.left) / c.width;
  });
  expect(next).toBeGreaterThan(0.6);
  // closing the Card gives the Board its width back
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("detail")).toBeHidden();
  const after = await widths(page);
  expect(after.pane).toBe(0);
  expect(after.col).toBeGreaterThan(w.col);
});

test("wide window: the Card pane stays the 560 px aside (#50)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await toBoard(page);
  await viaPalette(page, "Retry policy for sync");
  await expect(page.getByTestId("detail")).toBeVisible();
  const w = await widths(page);
  expect(Math.round(w.pane)).toBe(560);
  expect(Math.round(w.col)).toBeGreaterThanOrEqual(232);
});

test("Group by repo (#36): a toggle in the header, one lane per repo, collapsible, remembered", async ({ page }) => {
  await toBoard(page);
  const toggle = page.getByTestId("lane-toggle");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("column-Inbox")).toBeVisible(); // one list: nothing changes while off
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  const appLane = page.getByTestId("lane-acme/app");
  const aw = page.getByTestId("lane-acme/agent-workflow");
  await expect(appLane).toBeVisible();
  await expect(aw).toBeVisible();
  await expect(page.getByTestId("column-Inbox")).toHaveCount(0);
  // each lane shows only its repo's Cards
  await expect(appLane.locator(".card").first()).toContainText("app");
  await expect(appLane.getByText("agent-workflow")).toHaveCount(0);
  await expect(aw.locator(".card").first()).toContainText("agent-workflow");
  // one shared head row with every Phase
  const heads = page.getByTestId("board-heads");
  for (const p of ["Inbox", "Backlog", "UX Design", "Build", "Done"]) await expect(heads).toContainText(p);
  // it stays at the top while the Board scrolls
  const top = await page.evaluate(() => {
    const sc = document.querySelector(".scroll")!;
    sc.scrollTop = 300;
    return sc.getBoundingClientRect().top;
  });
  await expect.poll(async () => Math.round((await heads.boundingBox())!.y)).toBe(Math.round(top));
  // a lane collapses to its head
  const head = appLane.locator(".lane-head");
  await expect(head).toHaveAttribute("aria-expanded", "true");
  await head.click();
  await expect(head).toHaveAttribute("aria-expanded", "false");
  await expect(appLane.locator(".card")).toHaveCount(0);
  await head.press("Enter");
  await expect(appLane.locator(".card").first()).toBeVisible();
  // a Card picked from the palette in a collapsed lane opens its lane
  await head.click();
  await expect(head).toHaveAttribute("aria-expanded", "false");
  await viaPalette(page, "Retry policy for sync");
  await expect(head).toHaveAttribute("aria-expanded", "true");
  await expect(appLane.locator('.card[aria-selected="true"]')).toBeVisible();
  await page.keyboard.press("Escape");
  // the palette entry names the next state and is found by either wording
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("one list");
  await expect(page.getByRole("option", { name: /Show Board as one list/ })).toBeVisible();
  await page.keyboard.press("Escape");
  // remembered across a reload (browser storage)
  await page.reload();
  await expect(page.getByTestId("lane-toggle")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("lane-acme/app")).toBeVisible();
  await page.getByTestId("lane-toggle").click();
  await expect(page.getByTestId("column-Inbox")).toBeVisible();
});

test("Group by repo, narrow: the open Card's column is at the left edge in every lane", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await toBoard(page);
  await page.getByTestId("lane-toggle").click();
  await viaPalette(page, "Keyboard shortcut for quick add"); // Backlog
  await expect(page.getByTestId("detail")).toBeVisible();
  await expect.poll(async () => Math.abs(await offsetOf(page, "Backlog"))).toBeLessThanOrEqual(2);
  await expect(page.getByTestId("lane-acme/agent-workflow").locator('[data-column="Backlog"]')).toBeVisible();
  const sameLeft = await page.evaluate(() => {
    const lefts = [...document.querySelectorAll('.lane-cols [data-column="Backlog"]')].map((e) => Math.round(e.getBoundingClientRect().left));
    return new Set(lefts).size;
  });
  expect(sameLeft).toBe(1);
  await page.getByTestId("lane-toggle").click();
});
