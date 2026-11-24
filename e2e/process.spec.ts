import { expect, openFold, test, type Page, toast } from "./fixtures.ts";

// Process mode: the blockers on the left, the open Card on the right.
const row = (page: Page, n: number) => page.locator(`[data-card="acme/app#${n}"]`);
const open = (page: Page, n: number) => expect(page.getByTestId("detail")).toHaveAttribute("aria-label", `Card acme/app#${n}`);
const list = (page: Page) => page.getByTestId("waiting-list");
/** Opens a Card through the palette: unlike a click on a To look at row it does not mark a Look Seen (108 and 119 stay unseen). */
const openViaPalette = async (page: Page, text: string) => {
  await expect(page.getByTestId("waiting-list").locator(".qrow").first()).toBeVisible(); // the Board has loaded
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByPlaceholder("Type a command or search Cards…")).toBeFocused();
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
};

test("nothing is open on entry; j opens the first blocker, then j and k move the pane", async ({ page }) => {
  await page.goto("/");
  await expect(list(page).locator(".qrow").first()).toBeVisible();
  await expect(page.getByTestId("waiting")).toContainText("Select a Card");
  await expect(page.getByTestId("detail")).toHaveCount(0);
  await expect(list(page).locator('.qrow[aria-selected="true"]')).toHaveCount(0);
  await page.keyboard.press("j"); // with nothing open, j opens the first row (k does too)
  await expect(list(page).locator(".qrow").first()).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("detail")).toBeVisible();
  const first = await list(page).locator(".qrow").first().getAttribute("data-card");
  await expect(page.getByTestId("detail")).toHaveAttribute("aria-label", `Card ${first}`);
  await page.keyboard.press("j");
  await expect(list(page).locator(".qrow").nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("detail")).not.toHaveAttribute("aria-label", `Card ${first}`);
  await page.keyboard.press("k");
  await expect(page.getByTestId("detail")).toHaveAttribute("aria-label", `Card ${first}`);
  // the groups, each row with a kind label and the ask
  for (const g of ["Waiting on me", "To look at", "Awaiting pickup"]) await expect(list(page).locator(".group-head", { hasText: g })).toBeVisible();
  await expect(row(page, 106)).toContainText("PR approval");
  await expect(row(page, 107)).toHaveCount(0); // an agent decision is not a blocker (decisions.spec.ts)
  await expect(row(page, 119)).toContainText("Look");
  await expect(row(page, 117)).toContainText("How large may the offline cache grow?");
  await expect(page.getByRole("button", { name: "Close" })).toHaveCount(0); // no Close button in the split
});

test("a digit picks a decision option, ⌘↵ sends, the next blocker opens; a failed answer comes back", async ({ page }) => {
  await page.goto("/");
  await row(page, 117).click();
  const panel = page.getByTestId("panel-decision");
  await expect(panel.getByTestId("option-B")).toHaveAttribute("aria-checked", "true"); // the recommendation, picked from the start
  await page.keyboard.press("1");
  await expect(panel.getByTestId("option-A")).toHaveAttribute("aria-checked", "true");
  await expect(panel.getByTestId("option-B")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("toast")).toHaveCount(0); // a digit picks, it never sends
  await page.keyboard.press("2");
  await expect(panel.getByTestId("option-B")).toHaveAttribute("aria-checked", "true");
  await panel.getByTestId("push-toggle").uncheck();
  await panel.getByTestId("note-add").click();
  await panel.getByTestId("note").fill("with a note"); // last, so the focus is in the field for ⌘↵
  await page.route("**/api/cards/acme/app/117/answer", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) }));
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(toast(page, "Failed: boom")).toBeVisible();
  await open(page, 117);
  await expect(page.getByTestId("not-sent")).toContainText("boom");
  await expect(panel.getByTestId("note")).toHaveValue("with a note");
  await expect(panel.getByTestId("push-toggle")).not.toBeChecked(); // the Push choice is part of the draft
  await expect(row(page, 117)).toBeVisible();
  await expect(list(page).locator(".group-head", { hasText: "Waiting on me" })).toContainText("Waiting on me");
  await page.unroute("**/api/cards/acme/app/117/answer");
  // the panel was rebuilt for the returning Card, and it kept the drafted choice
  await expect(panel.getByTestId("option-B")).toHaveAttribute("aria-checked", "true");
  await expect(panel.getByTestId("writes")).toHaveText("Decision D1: B. with a note");
  await panel.getByTestId("push-toggle").check();
  await panel.getByTestId("note").focus();
  await page.keyboard.press("ControlOrMeta+Enter"); // send the kept draft again
  await expect(toast(page, "pushed to the coordinator")).toBeVisible();
  await expect(page.getByTestId("detail")).not.toHaveAttribute("aria-label", "Card acme/app#117"); // the next blocker opened
  await expect(list(page).locator(".group-head", { hasText: "Awaiting pickup" })).toBeVisible();
  await expect(page.locator('[data-card="acme/app#117"] .kind-chip')).toHaveText("Awaiting pickup");
});

test("PR approval and design round take digits and ⌘↵ too", async ({ page }) => {
  await page.goto("/");
  await row(page, 106).click();
  await page.keyboard.press("3"); // send back needs a note: ⌘↵ does nothing
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.getByTestId("panel-pr-approval")).toBeVisible();
  await page.keyboard.press("1");
  await expect(page.getByTestId("panel-pr-approval").getByRole("button", { name: /Approve/ })).toHaveClass(/selected/);
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(row(page, 106).locator(".kind-chip")).toHaveText("Awaiting pickup");

  await row(page, 118).click();
  await page.keyboard.press("1");
  await expect(page.getByTestId("panel-design-round").getByRole("button", { name: "Pick" }).first()).toHaveClass(/selected/);
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(row(page, 118).locator(".kind-chip")).toHaveText("Awaiting pickup");
});

test("no tabs: [ and ] do nothing on a Card whose ask has one question; an opened fold belongs to that opening of the Card", async ({ page }) => {
  await page.goto("/");
  await row(page, 105).click();
  await expect(page.getByTestId("detail").getByRole("tab")).toHaveCount(0);
  const issue = page.getByTestId("fold-issue").locator(".fold-head");
  await expect(issue).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("]");
  await page.keyboard.press("[");
  await expect(issue).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("panel-decision").getByTestId("option-B")).toHaveAttribute("aria-checked", "true"); // nothing moved
  await issue.click();
  await expect(page.getByTestId("fold-issue")).toContainText("Two devices editing");
  // another Card starts from its own state; nothing decided there, so it has no Decided fold
  await openViaPalette(page, "Compact density");
  await expect(page.getByTestId("fold-issue").locator(".fold-head")).toHaveAttribute("aria-expanded", "false"); // its Look stands first
  await expect(page.getByTestId("fold-decided")).toHaveCount(0);
  // and back: the fold opened before is closed again (it is not remembered per Card)
  await row(page, 105).click();
  await expect(issue).toHaveAttribute("aria-expanded", "false");
  // digits stay out of the way while the palette is open: typed into it, they pick nothing on the ask
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.press("1");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("panel-decision").getByTestId("option-B")).toHaveAttribute("aria-checked", "true");
});

test("Esc returns focus to the list and keeps the Card open", async ({ page }) => {
  await page.goto("/");
  await openViaPalette(page, "Compact density");
  await open(page, 119);
  await page.keyboard.press("Escape");
  await expect(list(page)).toBeFocused();
  await open(page, 119);
});

test("Agent activity: Tab cycles inside the overlay and never reaches the Board behind it", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("agents-line")).toContainText(/\d+ working/); // the Board has loaded
  await page.keyboard.press("g");
  await page.keyboard.press("a");
  const agents = page.getByRole("dialog", { name: "Agent activity" });
  await expect(agents).toBeFocused();
  const rows = await agents.locator(".arow").count();
  expect(rows).toBeGreaterThan(1);
  const inside = () => page.evaluate(() => !!document.activeElement?.closest('[data-testid="agents"]'));
  // the library's trap moves focus over a frame (a guard element first), so each step polls
  for (const key of ["Tab", "Shift+Tab"]) {
    for (let i = 0; i < rows + 2; i++) {
      await page.keyboard.press(key);
      await expect.poll(inside).toBe(true);
    }
  }
  await agents.locator(".arow").last().focus();
  await page.keyboard.press("Tab"); // past the last row: round to the first stop, not out to the Board
  await expect.poll(inside).toBe(true);
  await expect(agents.locator(".arow").last()).not.toBeFocused();
  await page.keyboard.press("Escape");
  await expect(agents).toBeHidden();
});

test("Agent activity: status line, g a overlay by state, a row opens the Card with its Activity fold open", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("agents-line")).toContainText(/\d+ working, [1-9]\d* stuck/);
  await expect(page.getByTestId("stuck-count")).toHaveClass(/bad/);
  await page.keyboard.press("g");
  await page.keyboard.press("a");
  const agents = page.getByRole("dialog", { name: "Agent activity" });
  await expect(agents).toBeVisible();
  const headings = await agents.locator(".group-head").allTextContents();
  const order = ["Stuck", "Working", "Parked", "Queued", "On hold"].filter((s) => headings.some((h) => h.trim().startsWith(s)));
  expect(headings.map((h) => h.replace(/\s*\d+$/, "").trim())).toEqual(order);
  await expect(page.getByTestId("agents-stuck")).toContainText("worker session ended without worker_done");
  await expect(page.getByTestId("agents-hold")).toContainText("Bulk edit tags");
  await page.keyboard.press("Escape");
  await expect(agents).toBeHidden();
  await page.getByTestId("agents-line").click();
  await agents.locator('[data-card="acme/app#112"]').click();
  await expect(agents).toBeHidden();
  await open(page, 112);
  await expect(page.getByTestId("fold-activity").locator(".fold-head")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("fold-activity").getByTestId("status")).toContainText("Working");
  await expect(page.getByTestId("coordination-log")).toContainText("E2E running on the built app");
  await expect(page.getByTestId("coordination-log").locator("li").first()).toContainText("E2E running"); // newest first
  // a Card outside the queue stays open: no list row is highlighted, the list does not take the selection back
  await expect(list(page).locator('[aria-selected="true"]')).toHaveCount(0);
  await page.waitForTimeout(1500);
  await open(page, 112);
});

test("a Card without a log says so", async ({ page }) => {
  await page.goto("/");
  await row(page, 105).click();
  await openFold(page, "activity");
  await expect(page.getByTestId("coordination-log")).toContainText("No coordination log for this issue.");
});

test("Repos in the sidebar filter every view and show the waiting count", async ({ page }) => {
  await page.goto("/");
  const repos = page.getByRole("group", { name: "Repos" });
  await expect(repos.getByRole("button", { name: /^app/ })).toContainText(/\d/);
  await repos.getByRole("button", { name: /^agent-workflow/ }).click();
  await expect(repos.getByRole("button", { name: /^agent-workflow/ })).toHaveAttribute("aria-pressed", "true");
  await expect(list(page).locator(".qrow")).toHaveCount(0);
  await expect(list(page)).toContainText("Nothing waits on you in agent-workflow.");
  await expect(page.getByTestId("agents-line")).toContainText("0 working, 1 stuck");
  await repos.getByRole("button", { name: /^agent-workflow/ }).click();
  await expect(list(page).locator(".qrow").first()).toBeVisible();
});

test("the Done column shows Look first and collapses the rest by day", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Board", exact: true }).click();
  const done = page.getByTestId("column-Done");
  await expect(done.getByTestId("done-look")).toContainText("Compact density toggle");
  const days = done.locator('[data-testid^="done-day-"]');
  expect(await days.count()).toBeGreaterThan(1);
  await expect(days.last().getByRole("button")).toHaveAttribute("aria-expanded", "false");
  await expect(done).not.toContainText("Shipped: small fixes");
  for (const b of await days.getByRole("button").all()) await b.click();
  await expect(done).toContainText("Shipped: small fixes");
  // j and k follow what is visible
  await done.locator("[data-card]").first().click();
  await page.keyboard.press("j");
  await expect(done.locator('[aria-selected="true"]')).toHaveCount(1);
});

test("every key is listed in the command palette", async ({ page }) => {
  await page.goto("/");
  await openViaPalette(page, "Compact density");
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByRole("option", { name: /Agent activity/ })).toContainText("g a");
  // the keys come from the key table (shortcuts.spec.ts checks the Feedback panels); a Look Card has no Feedback panel, so no Send entry
  await expect(page.getByRole("option", { name: /Next Card/ })).toContainText("j");
  await expect(page.getByRole("option", { name: /Mark the open Card/ })).toContainText("x");
  await expect(page.getByRole("option", { name: /Keyboard shortcuts/ })).toContainText("?");
  await expect(page.getByRole("option", { name: /Send the chosen Feedback/ })).toHaveCount(0);
  // a Done Card has no Activity fold, so no command for it; the issue text is one command away
  await expect(page.getByRole("option", { name: /Show coordination log/ })).toHaveCount(0);
  await page.getByPlaceholder("Type a command or search Cards…").fill("show issue");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("fold-issue").locator(".fold-head")).toHaveAttribute("aria-expanded", "true");
});
