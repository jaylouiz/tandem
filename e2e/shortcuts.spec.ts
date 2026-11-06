import { expect, test, type Page } from "./fixtures.ts";

// Shortcut overview and palette entries (#45). This spec uses the Cards 180 (PR approval) and 181 (two agent decisions): it only picks (drafts), it sends nothing.
const row = (page: Page, n: number) => page.locator(`[data-card="acme/app#${n}"]`);
const detail = (page: Page) => page.getByTestId("detail");
const palette = (page: Page) => page.getByRole("dialog", { name: "Command palette" });
const overview = (page: Page) => page.getByRole("dialog", { name: "Keyboard shortcuts" });
/** The app has loaded its Board (keys are bound, the palette has Cards to list). */
const loaded = async (page: Page) => {
  await page.goto("/");
  await expect(page.getByTestId("waiting-list").locator(".qrow").first()).toBeVisible();
};
/** Opens Card `n` from Waiting on me, or from the Board when it waits on nobody. */
const open = async (page: Page, n: number, view: "waiting" | "board" = "waiting") => {
  await loaded(page);
  if (view === "board") await page.getByRole("button", { name: "Board", exact: true }).click();
  await row(page, n).click();
  await expect(detail(page)).toHaveAttribute("aria-label", `Card acme/app#${n}`);
};
const option = (page: Page, name: RegExp | string) => palette(page).getByRole("option", { name });

test("? opens the overview with every group, Esc closes it, and the page behind is left alone", async ({ page }) => {
  await loaded(page);
  await page.keyboard.press("?");
  const d = overview(page);
  await expect(d).toBeVisible();
  // the list scrolls, so the keyboard lands on it: arrows and Page Down scroll it
  await expect(d.getByRole("region", { name: "All shortcuts" })).toBeFocused();
  for (const g of ["Anywhere", "Go to", "Cards", "Selection", "Triage", "Feedback", "Screenshots"]) await expect(d.getByTestId(`shortcuts-${g}`)).toBeVisible();
  // rows come from the key table: the label and its caps
  await expect(d.locator('[data-binding="go-board"]')).toContainText("Go to Board");
  await expect(d.locator('[data-binding="go-board"] kbd')).toHaveText(["g b"]);
  await expect(d.locator('[data-binding="next"] kbd')).toHaveText(["j", "↓"]);
  await expect(d.locator('[data-binding="send-feedback"] kbd')).toHaveText(["⌘↵"]);
  await expect(d.locator('[data-binding="pick-choice"] kbd')).toHaveText(["1–9"]);
  await expect(d.locator('[data-binding="shortcuts"] kbd')).toHaveText(["?"]);
  await expect(d.locator('[data-binding="gallery-viewport"] kbd')).toHaveText(["v"]);
  // the triage keys are in it too, with where a digit means something else
  await expect(d.locator('[data-binding="priority-1"]')).toContainText("without a Feedback panel");
  await page.keyboard.press("Escape");
  await expect(d).toHaveCount(0);
});

test("? is a character in a text field, and the overview is one dialog among the others", async ({ page }) => {
  await loaded(page);
  await page.keyboard.press("c");
  const field = page.getByRole("dialog", { name: "Capture an idea" }).getByRole("textbox").first();
  await expect(field).toBeFocused();
  await page.keyboard.type("why?");
  await expect(field).toHaveValue("why?");
  await expect(overview(page)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  // ⌘K from the overview does not stack a second dialog
  await page.keyboard.press("?");
  await expect(overview(page)).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(overview(page)).toBeVisible();
});

test("the palette lists Keyboard shortcuts with its key and runs it; its footer no longer carries a hand-kept list", async ({ page }) => {
  await loaded(page);
  await page.keyboard.press("ControlOrMeta+k");
  await expect(option(page, /Keyboard shortcuts/)).toContainText("?");
  await expect(page.getByTestId("palette-keys")).not.toContainText("pick a choice");
  await page.getByPlaceholder("Type a command or search Cards…").fill("shortcuts");
  await page.keyboard.press("Enter");
  await expect(overview(page)).toBeVisible();
});

test("a PR approval: the palette picks Approve, Hold merge and Send back with their digits, toggles Push and offers Send only once something is picked", async ({ page }) => {
  await open(page, 180);
  const pr = page.getByTestId("panel-pr-approval");
  await page.keyboard.press("ControlOrMeta+k");
  await expect(option(page, /Approve the PR/)).toContainText("1");
  await expect(option(page, /Hold the merge/)).toContainText("2");
  await expect(option(page, /Send the PR back/)).toContainText("3");
  await expect(option(page, /Send the chosen Feedback/)).toHaveCount(0); // nothing picked: Send would not write
  await expect(option(page, /Push this Feedback: turn off/)).toBeVisible();
  await option(page, /Hold the merge/).click();
  await expect(pr.getByRole("button", { name: /Hold/ })).toHaveClass(/selected/);
  await page.keyboard.press("ControlOrMeta+k");
  await expect(option(page, /Send the chosen Feedback/)).toContainText("⌘↵");
  await option(page, /Push this Feedback: turn off/).click();
  await expect(page.getByTestId("push-toggle")).not.toBeChecked();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(option(page, /Push this Feedback: turn on/)).toBeVisible();
  await page.keyboard.press("Escape");
});

test("agent decisions: Accept all and Challenge D2 sit in the palette on the Decided tab, with the digits the panel uses", async ({ page }) => {
  await open(page, 181, "board");
  await page.keyboard.press("]");
  const panel = page.getByTestId("panel-agent-decision");
  await expect(panel).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(option(page, /Accept all agent decisions/)).toContainText("1");
  await expect(option(page, /Challenge D1/)).toContainText("2");
  await expect(option(page, /Challenge D2/)).toContainText("3");
  await option(page, /Challenge D2/).click();
  await expect(panel.getByRole("button", { name: /Challenge D2/ })).toHaveAttribute("aria-pressed", "true");
  await expect(panel.locator("textarea")).toBeVisible();
});

test("Card entries: mark the open Card, close it, and show the coordination log from the palette", async ({ page }) => {
  await open(page, 180);
  await page.keyboard.press("ControlOrMeta+k");
  await expect(option(page, /Mark the open Card/)).toContainText("x");
  await expect(option(page, /Next Card/)).toContainText("j");
  await expect(option(page, /Previous Card/)).toContainText("k");
  await expect(option(page, /Select all Cards/)).toContainText("⌘A");
  await expect(option(page, /Clear the selection/)).toHaveCount(0);
  await option(page, /Mark the open Card/).click();
  await expect(page.getByTestId("markbar")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(option(page, /Clear the selection/)).toContainText("esc");
  await option(page, /Clear the selection/).click();
  await expect(page.getByTestId("markbar")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+k");
  await option(page, /Show coordination log/).click();
  await expect(page.getByTestId("tab-activity")).toBeVisible();
  await expect(page.getByTestId("tab-activity").getByTestId("status")).toBeVisible();
});
