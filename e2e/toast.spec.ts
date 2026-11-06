import { expect, test, type Page } from "./fixtures.ts";

// The toast stack (#43, ADR 0005, src/web/ui/Toast.tsx). Time stands still here (`page.clock`): a toast goes only when the test runs the clock, so
// "still there after 2 min" and "gone after 4 s" do not depend on how fast the machine is. It uses the Backlog
// Cards "Toast demo A-E" (#190-194), moves them to the Inbox; the plain toast it needs comes from "Refresh from GitHub" (writes nothing).
const toast = (page: Page, text: string) => page.getByTestId("toast").filter({ hasText: text });
const card = (page: Page, letter: string) => page.getByTestId("board").locator(".card", { hasText: `Toast demo ${letter}` });
const backlog = (page: Page) => page.getByTestId("column-Backlog");
const inbox = (page: Page) => page.getByTestId("column-Inbox");
const undoOf = (page: Page) => page.getByTestId("toast").getByRole("button", { name: "Undo" });

async function toBoard(page: Page) {
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await expect(backlog(page)).toContainText("Toast demo A");
}

/** Open the Card and move it to the Inbox with `i`. The toast with its Undo comes once the write is through (the Card moves at once), so wait for it: `offered` Undos by now. */
async function move(page: Page, letter: string, offered = 1) {
  await card(page, letter).click();
  await page.keyboard.press("i");
  await expect(inbox(page)).toContainText(`Toast demo ${letter}`);
  await expect(undoOf(page)).toHaveCount(offered);
}

/** A plain toast ("Refreshed from GitHub") through the palette, like a developer would. */
async function refresh(page: Page) {
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByPlaceholder("Type a command or search Cards…")).toBeFocused();
  await page.keyboard.type("Refresh from");
  await page.keyboard.press("Enter");
  await expect(toast(page, "Refreshed from GitHub")).toBeVisible();
}

test("move, then another action, then ⌘Z still undoes the move", async ({ page }) => {
  await toBoard(page);
  await move(page, "A");
  await expect(toast(page, "Moved")).toBeVisible();
  await refresh(page); // a later toast, in the single slot that used to hold the Undo
  await expect(toast(page, "Moved")).toBeVisible(); // the move's toast is still up beside it
  await page.keyboard.press("ControlOrMeta+z");
  await expect(backlog(page)).toContainText("Toast demo A");
  await expect(inbox(page)).not.toContainText("Toast demo A");
  await expect(toast(page, "Move undone")).toBeVisible();
  await expect(toast(page, "Moved")).toHaveCount(0); // an Undo that ran is gone: ⌘Z does not run it twice
  await page.keyboard.press("ControlOrMeta+z");
  await expect(backlog(page)).toContainText("Toast demo A");
});

test("⌘⇧Z (the system's Redo) does not run the Undo", async ({ page }) => {
  await toBoard(page);
  await move(page, "B");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(inbox(page)).toContainText("Toast demo B");
  await expect(undoOf(page)).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+z"); // and ⌘Z still does
  await expect(backlog(page)).toContainText("Toast demo B");
});

test("five moves keep five Undos: a toast beyond the library's default of three still undoes; ⌘Z walks them newest first", async ({ page }) => {
  await toBoard(page);
  const letters = ["A", "B", "C", "D", "E"];
  for (const [i, l] of letters.entries()) await move(page, l, i + 1);
  // the oldest toast (beyond the default limit of 3) is not inert: its own Undo button works
  await toast(page, "Moved").last().getByRole("button", { name: "Undo" }).click();
  await expect(backlog(page)).toContainText("Toast demo A");
  await expect(inbox(page)).not.toContainText("Toast demo A");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(backlog(page)).toContainText("Toast demo E"); // newest first
  await expect(inbox(page)).toContainText("Toast demo D");
  for (let i = 0; i < 3; i++) await page.keyboard.press("ControlOrMeta+z");
  for (const l of letters) await expect(backlog(page)).toContainText(`Toast demo ${l}`);
});

test("an Undo is offered for 8 s: after that ⌘Z does nothing", async ({ page }) => {
  await toBoard(page);
  await move(page, "A");
  await page.clock.runFor(8500);
  await expect(toast(page, "Moved")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(inbox(page)).toContainText("Toast demo A"); // still in the Inbox: nothing was undone
});

test("a toast pauses while hovered or focused, and goes 4 s after", async ({ page }) => {
  await toBoard(page);
  await refresh(page);
  const t = toast(page, "Refreshed from GitHub");
  await t.hover();
  await page.clock.runFor(30_000);
  await expect(t).toBeVisible(); // hovered: no timer runs
  await page.mouse.move(5, 5);
  await page.clock.runFor(4500);
  await expect(t).toHaveCount(0);
  // focus pauses too (F6 jumps into the region)
  await refresh(page);
  await page.keyboard.press("F6");
  await page.clock.runFor(30_000);
  await expect(t).toBeVisible();
});

test("a failure stays until dismissed and is announced as an alert; Esc on the focused toast dismisses it", async ({ page }) => {
  await toBoard(page);
  await page.route("**/api/cards/**/labels", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) }));
  await card(page, "A").click();
  await page.keyboard.press("i");
  const failed = toast(page, "Failed: boom");
  await expect(failed).toBeVisible();
  await expect(failed).toHaveAttribute("data-tone", "failed");
  await expect(page.getByRole("alert").filter({ hasText: "Failed: boom" })).toHaveCount(1); // announced urgently, not as a status
  await expect(backlog(page)).toContainText("Toast demo A"); // rolled back
  await page.clock.runFor(120_000);
  await expect(failed).toBeVisible(); // a failure does not time out
  await failed.locator(".toast-close").click(); // an alert toast is aria-hidden until the region has focus (Base UI), so no role query reaches its button
  await expect(failed).toHaveCount(0);
  // again: reach it from the keyboard, Esc dismisses it
  await page.keyboard.press("i");
  await expect(failed).toBeVisible();
  await page.keyboard.press("F6");
  await page.keyboard.press("Tab");
  await expect(failed).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(failed).toHaveCount(0);
});

test("every toast has a close button; Esc with no toast focused still clears the marks and leaves the toast", async ({ page }) => {
  await toBoard(page);
  await refresh(page);
  const t = toast(page, "Refreshed from GitHub");
  await expect(t.getByRole("button", { name: "Dismiss" })).toBeVisible();
  await card(page, "A").click();
  await page.keyboard.press("x");
  await expect(page.getByTestId("markbar")).toContainText("1 selected");
  await page.keyboard.press("Escape"); // focus is not on a toast: the key table clears the marks
  await expect(page.getByTestId("markbar")).toBeHidden();
  await expect(t).toBeVisible();
  // F6 puts focus on the region itself, not on a toast: Esc there is still "clear the marks", and it leaves the region (the timers run again)
  await card(page, "A").click();
  await page.keyboard.press("x");
  await expect(page.getByTestId("markbar")).toContainText("1 selected");
  await page.keyboard.press("F6");
  await expect(page.locator(".toast-viewport")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("markbar")).toBeHidden();
  await expect(page.locator(".toast-viewport")).not.toBeFocused();
  await expect(t).toBeVisible();
  // from a focused toast Esc dismisses the toast and does not also clear the marks
  await card(page, "A").click();
  await page.keyboard.press("x");
  await expect(page.getByTestId("markbar")).toContainText("1 selected");
  await page.keyboard.press("F6");
  await page.keyboard.press("Tab");
  await expect(t).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(t).toHaveCount(0);
  await expect(page.getByTestId("markbar")).toContainText("1 selected");
});

test("Refreshing does not end while the refresh runs, then becomes the outcome in place", async ({ page }) => {
  await toBoard(page);
  let release!: () => void;
  const gate = new Promise<void>((res) => (release = res));
  await page.route("**/api/refresh", async (r) => {
    await gate;
    await r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByPlaceholder("Type a command or search Cards…")).toBeFocused();
  await page.keyboard.type("Refresh from");
  await page.keyboard.press("Enter");
  await expect(toast(page, "Refreshing from GitHub…")).toBeVisible();
  await page.clock.runFor(60_000);
  await expect(toast(page, "Refreshing from GitHub…")).toBeVisible(); // still running: still said
  release();
  await expect(toast(page, "Refreshed from GitHub")).toBeVisible();
  await expect(page.getByTestId("toast")).toHaveCount(1); // the same toast, not a second one
  await page.clock.runFor(4500);
  await expect(page.getByTestId("toast")).toHaveCount(0);
});

test("the palette lists ⌘Z while an Undo is offered, and runs it", async ({ page }) => {
  await toBoard(page);
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByPlaceholder("Type a command or search Cards…")).toBeFocused();
  await expect(page.getByRole("option", { name: /Undo the last change/ })).toHaveCount(0); // nothing offered yet
  await page.keyboard.press("Escape");
  await move(page, "A");
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByPlaceholder("Type a command or search Cards…")).toBeFocused();
  await page.getByRole("option", { name: /Undo the last change/ }).click();
  await expect(backlog(page)).toContainText("Toast demo A");
  await expect(inbox(page)).not.toContainText("Toast demo A");
});
