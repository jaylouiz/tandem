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

test("Card keys and the Selection bar are not live where there are no Cards: Maps, Settings (U4)", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Views" }).getByRole("button", { name: "Wayfinder maps" }).click();
  await expect(page.getByTestId("map-109")).toBeVisible();
  await viaPalette(page, "app#117"); // the pane opens in Maps too (maps.spec.ts)
  const pane = detail(page);
  await expect(pane).toHaveAttribute("aria-label", "Card acme/app#117");
  for (const key of ["x", "h", "m", "i", "a", "d", "s", "b", "1", "2", "3", "0", "w", "l", "j", "k", "ArrowDown", "ControlOrMeta+a", "Shift+J"]) await page.keyboard.press(key);
  await expect(bar(page)).toBeHidden();
  await expect(page.getByTestId("toast")).toHaveCount(0); // nothing was written or Pushed
  await expect(pane).toHaveAttribute("aria-label", "Card acme/app#117"); // j/k did not walk anywhere
  // Settings has no Card pane: a Card picked in the palette opens on the Board instead of acting unseen
  await page.getByRole("navigation", { name: "Views" }).getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.keyboard.press("x");
  await page.keyboard.press("h");
  await expect(bar(page)).toBeHidden();
  await viaPalette(page, "Move demo A");
  await expect(page.getByTestId("board")).toBeVisible();
  await expect(detail(page)).toContainText("Move demo A");
});

test("the Feedback keys (digits, ⌘↵, [ ]) do nothing on Maps either: a Card picked there is shown, never answered by key (U4)", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (r) => r.method() !== "GET" && writes.push(`${r.method()} ${r.url()}`));
  await page.goto("/");
  await page.getByRole("navigation", { name: "Views" }).getByRole("button", { name: "Wayfinder maps" }).click();
  await expect(page.getByTestId("map-109")).toBeVisible();
  await viaPalette(page, "app#127"); // a real blocker: its Feedback panel is on the pane
  await expect(detail(page)).toHaveAttribute("aria-label", "Card acme/app#127");
  const tab = page.getByRole("tab", { selected: true });
  const was = await tab.textContent();
  await expect(page.getByTestId("panel-decision")).toBeVisible();
  for (const key of ["1", "2", "3", "ControlOrMeta+Enter", "]", "["]) await page.keyboard.press(key);
  await expect(page.getByTestId("toast")).toHaveCount(0); // no "Feedback given"
  await expect(page.getByTestId("panel-decision").locator("button.selected")).toHaveCount(0); // no choice was picked
  await expect(tab).toHaveText(was!); // [ ] did not change the tab
  expect(writes).toEqual([]);
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
  await page.getByRole("navigation", { name: "Views" }).getByRole("button", { name: "Wayfinder maps" }).click();
  await expect(page.getByTestId("map-109")).toBeVisible();
  expect(await prevented(page, "ArrowDown")).toBe(false); // Maps scrolls by arrow
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
