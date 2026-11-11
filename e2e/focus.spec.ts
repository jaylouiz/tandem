import { expect, test, type Page } from "./fixtures.ts";

// Focus: Waiting on me, one Card at a time (components/Focus.tsx). The list steps aside; answering or marking Seen moves on.
const list = (page: Page) => page.getByTestId("waiting-list");
const focus = (page: Page) => page.getByTestId("focus");
const count = (page: Page) => page.getByTestId("focus-count");
const open = (page: Page, n: number) => expect(page.getByTestId("detail")).toHaveAttribute("aria-label", `Card acme/app#${n}`);
const loaded = (page: Page) => expect(list(page).locator(".qrow").first()).toBeVisible();

test("the start button turns the list into Focus on the first blocker; j, k and the arrows step, Esc returns to the list with the Card open", async ({ page }) => {
  await page.goto("/waiting");
  await loaded(page);
  const total = (await list(page).locator('.qrow:not([data-kind="pickup"])').count()).toString();
  await page.getByTestId("focus-start").click();
  await expect(focus(page)).toBeVisible();
  await expect(list(page)).toHaveCount(0);
  await open(page, 106);
  await expect(count(page)).toHaveText(`1 of ${total}`);
  await expect(page.getByRole("button", { name: "Previous Card" })).toHaveAttribute("aria-disabled", "true"); // and it says why
  await expect(page.getByRole("button", { name: "Previous Card" })).toHaveAttribute("title", "This is the first one");
  await expect(page.getByTestId("focus-next")).toContainText("Stability demo: PR approval");
  await expect(page.getByTestId("triage")).toHaveCount(0); // the sheet is the ask alone
  await page.keyboard.press("j");
  await open(page, 173);
  await expect(count(page)).toHaveText(`2 of ${total}`);
  await page.keyboard.press("ArrowRight");
  await open(page, 177);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("k");
  await open(page, 106);
  await page.getByTestId("focus-next").click();
  await open(page, 173);
  await page.keyboard.press("Escape");
  await expect(focus(page)).toHaveCount(0);
  await expect(list(page).locator('.qrow[aria-selected="true"]')).toHaveAttribute("data-card", "acme/app#173");
  await open(page, 173);
});

test("an answer given in Focus brings the next Card; the count moves on and the answered one is done", async ({ page }) => {
  await page.goto("/waiting");
  await loaded(page);
  await page.keyboard.press("f");
  await open(page, 106);
  const total = (await count(page).textContent())!.split(" of ")[1]!;
  await page.keyboard.press("1"); // Approve
  await expect(page.getByTestId("panel-pr-approval").getByRole("button", { name: /Approve/ })).toHaveClass(/selected/);
  await page.keyboard.press("ControlOrMeta+Enter");
  await open(page, 173);
  await expect(focus(page)).toBeVisible();
  await expect(count(page)).toHaveText(`2 of ${total}`);
  await expect(focus(page).locator('.focus-pips i[data-state="done"]')).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-card="acme/app#106"]')).toHaveAttribute("data-kind", "pickup");
});

test("Focus does not mark a Look Seen by passing it; Mark Seen does, and moves on", async ({ page }) => {
  await page.goto("/waiting");
  await loaded(page);
  const looks = await list(page).locator('.qrow[data-kind="look"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-card")!));
  expect(looks.length).toBeGreaterThan(2);
  const blockers = await list(page).locator('.qrow:not([data-kind="look"]):not([data-kind="pickup"])').count();
  await page.keyboard.press("f");
  for (let i = 0; i < blockers + 1; i++) await page.keyboard.press("j"); // onto the second Look, past the first
  await expect(page.getByTestId("detail")).toHaveAttribute("aria-label", `Card ${looks[1]}`);
  await page.getByTestId("focus-seen").click();
  await expect(page.getByTestId("detail")).toHaveAttribute("aria-label", `Card ${looks[2]}`);
  await page.keyboard.press("l"); // the key does the same
  await expect(page.getByTestId("detail")).not.toHaveAttribute("aria-label", `Card ${looks[2]}`);
  await page.keyboard.press("Escape");
  const left = await list(page).locator('.qrow[data-kind="look"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-card")!));
  expect(left).toContain(looks[0]); // passed, not Seen
  expect(left).not.toContain(looks[1]);
  expect(left).not.toContain(looks[2]);
});

test("f starts Focus from the Board; with nothing waiting it says so and Esc leads back to the list", async ({ page }) => {
  await page.goto("/board");
  await expect(page.locator(".card").first()).toBeVisible();
  await page.keyboard.press("f");
  await expect(page).toHaveURL(/\/waiting/);
  await expect(focus(page)).toBeVisible();
  await open(page, 106);
  await page.keyboard.press("Escape");
  await expect(list(page)).toBeVisible();

  await page.goto("/waiting?repo=acme/agent-workflow"); // a repo without blockers or Looks
  await expect(page.getByTestId("filtered-empty")).toBeVisible();
  await page.keyboard.press("f");
  await expect(page.getByTestId("focus-done")).toContainText("Nothing waits on you");
  await page.getByTestId("focus-done").getByRole("button", { name: /Back to the list/ }).click();
  await expect(list(page)).toBeVisible();
});

test("the palette offers Focus with its key, and Leave Focus while it is on", async ({ page }) => {
  await page.goto("/waiting");
  await loaded(page);
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("one card at a time");
  await page.keyboard.press("Enter");
  await expect(focus(page)).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("leave focus");
  await page.keyboard.press("Enter");
  await expect(focus(page)).toHaveCount(0);
});
