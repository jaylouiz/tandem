import { expect, test, type Page } from "./fixtures.ts";

// Keyboard basics (#41). Read-only on the fixture data: these tests mark and open Cards, they write nothing.
// Counts are read from the page, not hard-coded.
const detail = (page: Page) => page.getByTestId("detail");
const bar = (page: Page) => page.getByTestId("markbar");
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
/** Dispatches a keydown on the page and says whether the app called preventDefault on it. */
const prevented = (page: Page, key: string) =>
  page.evaluate((k) => {
    const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
    document.body.dispatchEvent(e);
    return e.defaultPrevented;
  }, key);

test("Board j/k/arrows keep the selected Card in view and focused, so Enter acts on the Card the pane shows (U5)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 420 }); // short: the Inbox column scrolls
  await toBoard(page);
  const inbox = page.getByTestId("column-Inbox");
  const total = await inbox.locator(".card").count();
  expect(total).toBeGreaterThan(5);
  await inbox.locator(".card").first().click();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press(i % 2 ? "ArrowDown" : "j");
    const open = page.locator('.card[aria-selected="true"]');
    await expect(open).toHaveCount(1);
    await expect(open).toBeFocused();
    await expect(open).toBeInViewport();
  }
  const key = await page.locator('.card[aria-selected="true"]').getAttribute("data-card");
  await page.keyboard.press("Enter"); // acts on the focused Card: the one the pane shows
  await expect(detail(page)).toHaveAttribute("aria-label", `Card ${key}`);
  await page.keyboard.press("k");
  await expect(page.locator('.card[aria-selected="true"]')).toBeFocused();
  await expect(page.locator('.card[aria-selected="true"]')).toBeInViewport();
});

/** Presses Tab until focus is in the open Card's sheet; fails when it lands on another Card or row on the way. */
const tabToSheet = async (page: Page, max = 8) => {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const at = await page.evaluate(() => ({ inSheet: !!document.activeElement?.closest('[data-testid="detail"]'), row: !!document.activeElement?.matches(".card, .qrow") }));
    expect(at.row).toBe(false);
    if (at.inSheet) return;
  }
  throw new Error(`Tab did not reach the sheet in ${max} presses`);
};

test("the Board and the Waiting list are one tab stop each: the open Card, else the first; Tab goes on to the sheet (J3)", async ({ page }) => {
  await toBoard(page);
  const stops = page.locator('.board .card[tabindex="0"]');
  await expect(stops).toHaveCount(1); // nothing open: the first Card
  await page.locator('[data-card="acme/app#117"]').click();
  await expect(stops).toHaveCount(1);
  await expect(stops).toHaveAttribute("data-card", "acme/app#117");
  await page.keyboard.press("j");
  const open = page.locator('.card[aria-selected="true"]');
  await expect(open).toBeFocused();
  await expect(open).toHaveAttribute("tabindex", "0");
  await tabToSheet(page);

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Waiting on me/ }).click();
  const rows = page.locator('[data-testid="waiting-list"] .qrow[tabindex="0"]');
  await expect(rows).toHaveCount(1);
  await page.locator('[data-testid="waiting-list"] .qrow').first().click();
  await page.keyboard.press("j");
  const row = page.locator('[data-testid="waiting-list"] .qrow[aria-selected="true"]');
  await expect(row).toBeFocused(); // j carries the focus along
  await expect(rows).toHaveCount(1);
  await expect(row).toHaveAttribute("tabindex", "0");
  await tabToSheet(page, 3);
});

test("Card keys and the Selection bar are not live where there are no Cards: Settings (U4)", async ({ page }) => {
  await page.goto("/");
  // Settings has no Card pane: a Card picked in the palette opens on the Board instead of acting unseen
  await page.getByRole("navigation", { name: "Views" }).getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  for (const key of ["x", "h", "m", "i", "a", "d", "s", "b", "1", "2", "3", "0", "w", "e", "j", "k", "ArrowDown", "ControlOrMeta+a", "Shift+J"]) await page.keyboard.press(key);
  await expect(bar(page)).toBeHidden();
  await expect(page.getByTestId("toast")).toHaveCount(0); // nothing was written or Pushed
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await viaPalette(page, "Move demo A");
  await expect(page.getByTestId("board")).toBeVisible();
  await expect(detail(page)).toContainText("Move demo A");
});

test("⌘A marks the open Card's whole Board column, Esc clears (U17)", async ({ page }) => {
  await toBoard(page);
  const inbox = page.getByTestId("column-Inbox");
  const total = await inbox.locator(".card").count();
  await inbox.locator(".card").nth(1).click();
  await page.keyboard.press("ControlOrMeta+a");
  await expect(bar(page)).toContainText(`${total} selected`);
  await expect(inbox.locator('.card[data-marked="true"]')).toHaveCount(total);
  await expect(page.locator('.card[data-marked="true"]')).toHaveCount(total); // no other column
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(""); // no page text
  await page.keyboard.press("Escape");
  await expect(bar(page)).toBeHidden();
  await expect(page.locator('.card[data-marked="true"]')).toHaveCount(0);
  await expect(detail(page)).toBeVisible(); // the open Card stays open
});

test("⌘A in Waiting on me marks the group of the open row (U17)", async ({ page }) => {
  await page.goto("/");
  const blockers = page.locator('[data-testid="waiting-list"] .qrow:not([data-kind="look"]):not([data-kind="pickup"])');
  await expect(blockers.first()).toBeVisible();
  const total = await blockers.count();
  expect(total).toBeGreaterThan(1);
  await blockers.first().click();
  await page.keyboard.press("ControlOrMeta+a");
  await expect(bar(page)).toContainText(`${total} selected`);
  await expect(page.locator('.qrow[data-marked="true"]')).toHaveCount(total);
  await expect(page.locator('.qrow[data-kind="look"][data-marked="true"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(bar(page)).toBeHidden();
});

test("⌘A keeps its native meaning in a text field (U17)", async ({ page }) => {
  await toBoard(page);
  await page.keyboard.press("c");
  const title = page.getByPlaceholder("Title");
  await title.fill("some idea");
  await page.keyboard.press("ControlOrMeta+a");
  await expect(bar(page)).toBeHidden();
  expect(await title.evaluate((el: HTMLInputElement) => el.selectionEnd! - el.selectionStart!)).toBe("some idea".length);
});

test("arrow keys are only prevented when they moved a selection (U19)", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Views" }).getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  expect(await prevented(page, "ArrowDown")).toBe(false); // Settings scrolls by arrow
  expect(await prevented(page, "ArrowUp")).toBe(false);
  await page.getByRole("navigation", { name: "Views" }).getByRole("button", { name: "Board" }).click();
  const cards = page.getByTestId("board").locator(".card");
  await cards.first().click();
  expect(await prevented(page, "ArrowUp")).toBe(false); // already on the first Card: nothing moved
  expect(await prevented(page, "ArrowDown")).toBe(true);
  await cards.last().click();
  expect(await prevented(page, "ArrowDown")).toBe(false); // already on the last Card
});

test("the first Esc in a text field leaves it and keeps the text, the next one acts as usual (U25)", async ({ page }) => {
  await page.goto("/");
  const blockers = page.locator('[data-testid="waiting-list"] .qrow:not([data-kind="look"]):not([data-kind="pickup"])');
  await expect(blockers.nth(1)).toBeVisible();
  await blockers.nth(1).click(); // the second blocker: k goes to the first, never into a Look (opening one marks it Seen)
  const first = await blockers.first().getAttribute("data-card");
  const field = detail(page).locator("textarea").first();
  await field.click();
  await field.fill("keep this");
  await page.keyboard.press("Escape");
  await expect(field).not.toBeFocused();
  await expect(field).toHaveValue("keep this");
  await expect(detail(page)).toBeVisible();
  await page.keyboard.press("k"); // keys are live again without a click
  await expect(detail(page)).toHaveAttribute("aria-label", `Card ${first}`);
  await page.keyboard.press("j");
  await field.click();
  await page.keyboard.press("Escape");
  await expect(field).not.toBeFocused();
  await page.keyboard.press("Escape"); // now it acts as usual: back to the list, the Card stays open
  await expect(page.getByTestId("waiting-list")).toBeFocused();
  await expect(detail(page)).toBeVisible();
});
