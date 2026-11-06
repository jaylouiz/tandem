import { expect, test, WRITE } from "./fixtures.ts";

// Triage: each test starts on boot-state demo data (e2e/fixtures.ts) and moves Cards 101, 102, 111, 21 or captured ideas.
const card = (page: import("./fixtures.ts").Page, n: number) => page.locator(`[data-card="acme/app#${n}"]`);
const toBoard = async (page: import("./fixtures.ts").Page) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Board", exact: true }).click();
};

test("keyboard: set a Next step moves an Inbox Card to the Backlog, h holds it", async ({ page }) => {
  await toBoard(page);
  await card(page, 101).click();
  await page.keyboard.press("s");
  const backlog = page.getByTestId("column-Backlog");
  await expect(backlog).toContainText("Export tasks as CSV");
  await expect(card(page, 101)).toContainText("Next: specify");
  await expect(page.getByTestId("column-Inbox")).not.toContainText("Export tasks as CSV");
  await page.keyboard.press("h");
  await expect(card(page, 101)).toContainText("On hold");
  await expect(page.locator(".toast", { hasText: "Held · app#101" })).toBeVisible(); // the toast names the outcome (#46)
  await expect(page.getByTestId("triage").getByRole("button", { name: /Release hold/ })).toBeVisible();
  await page.keyboard.press("h");
  await expect(card(page, 101)).not.toContainText("On hold");
  await expect(page.locator(".toast", { hasText: "Released · app#101" })).toBeVisible();
});

test("bulk: x marks Cards and one key triages them all", async ({ page }) => {
  await toBoard(page);
  for (const title of ["Bulk A", "Bulk B"]) {
    await page.keyboard.press("c");
    await page.getByPlaceholder("Title").fill(title);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("column-Inbox")).toContainText(title);
  }
  await page.getByTestId("column-Inbox").locator(".card", { hasText: "Bulk A" }).click();
  await page.keyboard.press("x"); // x marks the open Card; a plain click on another Card would clear the marks
  await page.getByTestId("column-Inbox").locator(".card", { hasText: "Bulk B" }).click({ modifiers: [process.platform === "darwin" ? "Meta" : "Control"] });
  await expect(page.getByTestId("markbar")).toContainText("2 selected");
  await page.keyboard.press("b");
  await expect(page.getByTestId("toast").filter({ hasText: "2 of 2 updated" })).toBeVisible();
  for (const title of ["Bulk A", "Bulk B"]) {
    await expect(page.getByTestId("column-Backlog").locator(".card", { hasText: title })).toContainText("Next: build");
  }
  await expect(page.getByTestId("markbar")).toBeHidden();
});

test("a failed write rolls the Card back and says so", async ({ page }) => {
  await toBoard(page);
  await page.route("**/api/cards/**/labels", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) }));
  await card(page, 102).click();
  await page.keyboard.press("d");
  await expect(page.getByTestId("toast").filter({ hasText: "Failed: boom" })).toBeVisible();
  await expect(page.getByTestId("column-Inbox")).toContainText("Fog: rethink recurring tasks");
});

test("a bulk set skips Cards the action does not fit and counts them", async ({ page }) => {
  await toBoard(page);
  await card(page, 102).click();
  await page.keyboard.press("x");
  await card(page, 106).click({ modifiers: [process.platform === "darwin" ? "Meta" : "Control"] });
  await page.keyboard.press("s");
  await expect(page.getByTestId("toast").filter({ hasText: "1 of 2 updated, 1 skipped (Build)" })).toBeVisible();
});

test("the palette lists triage actions with their keys, only with a target", async ({ page }) => {
  await toBoard(page);
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByPlaceholder("Type a command or search Cards…")).toBeFocused();
  await expect(page.getByRole("option", { name: /Next step: specify/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await card(page, 103).click();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByRole("option", { name: /Next step: specify/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Hand to agent/ })).toContainText("a");
});

test("priority keys set P1-P3, sort the Backlog column and 0 clears", async ({ page }) => {
  await toBoard(page);
  const backlog = page.getByTestId("column-Backlog");
  await page.locator('[data-card="acme/agent-workflow#21"]').click();
  await page.keyboard.press("1");
  await expect(page.locator('[data-card="acme/agent-workflow#21"]')).toContainText("P1");
  await expect(backlog.locator(".card").first()).toContainText("Retro: shrink the build skill");
  await page.keyboard.press("3");
  await expect(page.locator('[data-card="acme/agent-workflow#21"]')).not.toContainText("P1");
  await expect(page.locator('[data-card="acme/agent-workflow#21"]')).toContainText("P3");
  await expect(backlog.locator(".card").first()).toContainText("Keyboard shortcut for quick add"); // P2 before P3
  // k follows the screen order (priority), not last moved: the Card above #21 on screen is the one before it in the column
  const cards = await backlog.locator(".card").evaluateAll((els) => els.map((e) => e.getAttribute("data-card")));
  const at = cards.indexOf("acme/agent-workflow#21");
  expect(at).toBeGreaterThan(0);
  await page.keyboard.press("k");
  await expect(page.locator(`[data-card="${cards[at - 1]}"]`)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("j");
  await expect(page.locator('[data-card="acme/agent-workflow#21"]')).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("0");
  await expect(page.locator('[data-card="acme/agent-workflow#21"]')).not.toContainText(/P[123]/);
});

test("fog: w marks an Inbox Card, which stays in Inbox with no Next step; a Next step clears it", async ({ page }) => {
  await toBoard(page);
  await card(page, 111).click();
  await page.keyboard.press("w");
  await expect(card(page, 111)).toContainText("Needs wayfinder");
  await expect(card(page, 111)).not.toContainText("Next:");
  await expect(page.getByTestId("column-Inbox")).toContainText("Fog candidate: sync conflicts");
  const detail = page.getByTestId("detail");
  await expect(detail.getByTestId("fog-hint")).toContainText("/wayfinder 111");
  await expect(detail.getByRole("button", { name: /^specify/ })).toHaveCount(0);
  await expect(detail.getByRole("button", { name: /Hand to agent/ })).toHaveCount(0);
  await page.keyboard.press("s");
  await expect(card(page, 111)).not.toContainText("Needs wayfinder");
  await expect(page.getByTestId("column-Backlog")).toContainText("Fog candidate: sync conflicts");
  await expect(card(page, 111)).toContainText("Next: specify");
});

test("fog Cards show the wayfinder command and are not handed to agents", async ({ page }) => {
  await toBoard(page);
  await card(page, 116).click();
  await expect(page.getByTestId("fog-hint")).toContainText("/wayfinder 116");
  await page.keyboard.press("a");
  await expect(page.getByTestId("toast").filter({ hasText: "Not applicable" })).toBeVisible();
});

const handed = (page: import("./fixtures.ts").Page) => page.getByTestId("detail").getByTestId("handed");
const handButton = (page: import("./fixtures.ts").Page) => page.getByTestId("detail").getByRole("button", { name: /Hand to agent/ });

test("Hand to agent: the Card shows it was handed over, offers no second Push, hold and release brings the button back", async ({ page }) => {
  await toBoard(page);
  await card(page, 130).click();
  await handButton(page).click();
  await expect(handed(page)).toContainText(/Handed to the coordinator · build · \d\d:\d\d/);
  await expect(handed(page)).toContainText("Hold and release to hand again");
  await expect(handButton(page)).toHaveCount(0);
  await expect(page.getByTestId("toast").filter({ hasText: "Handed to the coordinator" })).toBeVisible();
  // the keyboard stays where the button was
  await expect(handed(page)).toBeFocused();
  await page.keyboard.press("a");
  await expect(page.getByTestId("toast").filter({ hasText: "Not applicable: already handed" })).toBeVisible();
  await page.keyboard.press("h");
  await expect(card(page, 130)).toContainText("On hold");
  await page.keyboard.press("h");
  await expect(card(page, 130)).not.toContainText("On hold");
  await expect(handed(page)).toHaveCount(0);
  await expect(handButton(page)).toBeEnabled();
  // the palette no longer lists it for a handed Card either
  await page.keyboard.press("a");
  await expect(handed(page)).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByRole("option", { name: /Hand to agent/ })).toHaveCount(0);
});

test("Hand to agent: a failed Push rolls back with the reason and stays retryable", async ({ page }) => {
  await toBoard(page);
  await card(page, 131).click();
  await page.route("**/api/cards/**/start", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) }));
  await handButton(page).click();
  await expect(page.getByTestId("toast").filter({ hasText: "Failed: boom" })).toBeVisible();
  await expect(handed(page)).toHaveCount(0);
  await expect(handButton(page)).toBeEnabled();
  await expect(handButton(page)).toBeFocused(); // the keyboard goes back to where it was
  await page.unroute("**/api/cards/**/start");
  await handButton(page).click();
  await expect(handed(page)).toContainText("Handed to the coordinator · build");
});

test("Hand to agent: without a coordinator nothing is handed; Start coordinator retries per repo and hands the Card once it starts", async ({ page }) => {
  await toBoard(page);
  await page.getByTestId("column-Backlog").locator(".card", { hasText: "Hand demo: no coordinator" }).click();
  await handButton(page).click();
  await expect(page.getByTestId("toast").filter({ hasText: "No coordinator running" })).toBeVisible();
  await expect(handed(page)).toHaveCount(0);
  await expect(handButton(page)).toBeEnabled();
  const start = page.getByTestId("toast").filter({ hasText: "No coordinator running" }).getByRole("button", { name: "Start coordinator" });
  // no checkout known yet: the start fails, nothing is handed, the toast keeps the retry
  await start.click();
  await expect(page.getByTestId("toast").filter({ hasText: "Could not start coordinator for acme/agent-workflow: No local checkout known" })).toBeVisible();
  await expect(handed(page)).toHaveCount(0);
  // the failure is a toast of its own (it stays, an alert is aria-hidden until the region has focus, so the retry is found by tag): the retry is on it
  const retry = page.getByTestId("toast").filter({ hasText: "Could not start coordinator" }).locator("button", { hasText: "Start coordinator" });
  await expect(retry).toBeVisible();
  await page.request.put("/api/repos/path", { data: { repo: "acme/agent-workflow", path: "/tmp/agent-workflow" }, headers: WRITE });
  await retry.click();
  await expect(page.getByTestId("toast").filter({ hasText: "Coordinator starting for acme/agent-workflow" })).toBeVisible();
  await expect(handed(page)).toContainText("Handed to the coordinator · build");
});

// ---- #19: multi-select and moving Cards (own Cards: Move demo A-H, #150-157) ----
const ctrl = process.platform === "darwin" ? "Meta" : "Control";
const bar = (page: import("./fixtures.ts").Page) => page.getByTestId("markbar");
const inbox = (page: import("./fixtures.ts").Page) => page.getByTestId("column-Inbox");
const backlog = (page: import("./fixtures.ts").Page) => page.getByTestId("column-Backlog");

test("select: ctrl-click toggles, shift-click ranges inside a column, the bar counts, the Card pane steps aside, esc clears", async ({ page }) => {
  await toBoard(page);
  await expect(bar(page)).toBeHidden();
  await card(page, 150).click();
  await expect(page.getByTestId("detail")).toBeVisible();
  await card(page, 152).click({ modifiers: [ctrl] });
  await expect(bar(page)).toContainText("2 selected"); // the open Card joins the selection
  await expect(page.getByTestId("detail")).toBeHidden(); // 2+ selected: no Card pane content ...
  await expect(page.getByTestId("pane-marked")).toContainText("2 Cards selected"); // ... but its width stays (#29)
  await card(page, 154).click({ modifiers: ["Shift"] });
  await expect(bar(page)).toContainText("4 selected"); // 150, 152 and the range 152-154
  await card(page, 152).click({ modifiers: [ctrl] });
  await expect(bar(page)).toContainText("3 selected");
  await expect(card(page, 152)).not.toHaveAttribute("data-marked", "true");
  await expect(card(page, 153)).toHaveAttribute("data-marked", "true");
  await page.keyboard.press("Escape");
  await expect(bar(page)).toBeHidden();
  await expect(page.getByTestId("detail")).toBeVisible(); // the open Card is still open
  await expect(page.getByTestId("pane-marked")).toHaveCount(0);
});

for (const scheme of ["light", "dark"] as const) {
  test(`select (#29): marking and unmarking Cards changes no Card's size or the scroll position (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 1440, height: 600 }); // short: the Board scrolls, yet Card 154 stays above the Selection bar's scroll-padding (#41): Playwright scrolls a covered target into view before it clicks
    await toBoard(page);
    const keys = [150, 151, 152, 153, 154];
    const boxes = async () => Promise.all(keys.map((n) => card(page, n).boundingBox()));
    const scroller = page.locator(".scroll");
    await card(page, 150).click(); // the Card pane is open while marking
    await expect(page.getByTestId("detail")).toBeVisible();
    await scroller.evaluate((el) => (el.scrollTop = 40));
    const scrolled = await scroller.evaluate((el) => el.scrollTop);
    const before = await boxes();
    const all = await page.locator(".card").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
    await card(page, 152).click({ modifiers: [ctrl] });
    await card(page, 154).click({ modifiers: ["Shift"] });
    await expect(bar(page)).toContainText("4 selected"); // 150, 152 and the range 152-154
    await expect(card(page, 153)).toHaveAttribute("data-marked", "true");
    expect(await boxes()).toEqual(before);
    expect(await page.locator(".card").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width))).toEqual(all);
    for (const how of ["click", "esc", "clear"] as const) {
      if (how === "click") await card(page, 152).click({ modifiers: [ctrl] });
      else if (how === "esc") await page.keyboard.press("Escape");
      else {
        await card(page, 151).click({ modifiers: [ctrl] });
        await card(page, 152).click({ modifiers: [ctrl] });
        await bar(page).getByRole("button", { name: /Clear/ }).click();
      }
      expect(await boxes()).toEqual(before);
      expect(await scroller.evaluate((el) => el.scrollTop)).toBe(scrolled);
    }
    await expect(bar(page)).toBeHidden();
    await expect(page.getByTestId("detail")).toBeVisible();
  });
}

// ---- #33: a click on empty Board space closes the Card pane ----
test("board (#33): a click on empty column space closes the Card pane, a Card click and a drag do not; marks stay", async ({ page }) => {
  await toBoard(page);
  const detail = page.getByTestId("detail");
  await card(page, 150).click();
  await expect(detail).toBeVisible();
  await page.getByTestId("column-Inbox").locator(".column-head").click(); // a column head is not empty space
  await expect(detail).toBeVisible();
  await card(page, 151).click();
  await expect(detail).toBeVisible();
  // a drag that ends on empty space (the gap between columns) does not close it
  const from = (await card(page, 151).boundingBox())!;
  const col = (await page.getByTestId("column-Inbox").boundingBox())!;
  await page.mouse.move(from.x + 20, from.y + 10);
  await page.mouse.down();
  await page.mouse.move(col.x + col.width + 3, from.y + 10, { steps: 8 });
  await page.mouse.up();
  await expect(detail).toBeVisible();
  // a press on empty space that is released on a Card (or after selecting across) is a drag, not a click: the pane stays
  const emptyX = from.x + from.width + 3;
  await page.mouse.move(emptyX, from.y + 5);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 10, { steps: 6 });
  await page.mouse.up();
  await expect(detail).toBeVisible();
  // empty column space below the last Card closes it; the marks stay
  await card(page, 150).click({ modifiers: [ctrl] });
  await expect(bar(page)).toContainText("2 selected");
  const ux = page.getByTestId("column-UX Design");
  const box = (await ux.boundingBox())!;
  const last = (await ux.locator(".card").last().boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, last.y + last.height + 30); // below the last Card
  await expect(page.getByTestId("pane-marked")).toHaveCount(0);
  await expect(detail).toBeHidden();
  await expect(bar(page)).toContainText("2 selected");
  await page.keyboard.press("Escape");
  // the bar and the pane never count as empty space
  await card(page, 150).click();
  await detail.click({ position: { x: 10, y: 10 } });
  await expect(detail).toBeVisible();
  // the gap between two columns
  const nb = (await page.getByTestId("column-Backlog").boundingBox())!;
  await page.mouse.click(col.x + col.width + (nb.x - col.x - col.width) / 2, col.y + 200);
  await expect(detail).toBeHidden();
});

test("select: shift+j / shift+k extend the selection by keyboard", async ({ page }) => {
  await toBoard(page);
  await card(page, 150).click();
  await page.keyboard.press("Shift+J");
  await page.keyboard.press("Shift+J");
  await expect(bar(page)).toContainText("3 selected");
  await page.keyboard.press("Shift+K");
  await expect(bar(page)).toContainText("3 selected"); // going back over marked Cards does not unmark them
  await page.keyboard.press("Escape");
  await expect(bar(page)).toBeHidden();
});

test("Move to Backlog with a picked Next step, then Undo", async ({ page }) => {
  await toBoard(page);
  await card(page, 153).click();
  await card(page, 154).click({ modifiers: [ctrl] });
  await bar(page).getByRole("combobox", { name: "Next step for moved Cards" }).selectOption("build");
  await bar(page).getByRole("button", { name: /Move to Backlog/ }).click();
  await expect(page.getByTestId("toast").filter({ hasText: "Moved 2 Cards to Backlog (Build)" })).toBeVisible();
  for (const n of [153, 154]) {
    await expect(backlog(page).locator(`[data-card="acme/app#${n}"]`)).toContainText("Next: build");
    await expect(inbox(page).locator(`[data-card="acme/app#${n}"]`)).toHaveCount(0);
  }
  await expect(bar(page)).toBeHidden();
  await page.getByTestId("toast").filter({ hasText: "Moved 2 Cards" }).getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("toast").filter({ hasText: "Move undone" })).toBeVisible();
  for (const n of [153, 154]) {
    await expect(inbox(page).locator(`[data-card="acme/app#${n}"]`)).toHaveCount(1);
    await expect(card(page, n)).not.toContainText("Next:");
  }
});

test("drag a selected Card: the whole selection moves to Backlog, a refusing column moves nothing", async ({ page }) => {
  await toBoard(page);
  await card(page, 155).click();
  await card(page, 156).click({ modifiers: [ctrl] });
  // the Card pane keeps its width while marking (#29) and would cover the Build column: close it with a click between two columns (#33; the marks stay)
  const gap = await inbox(page).boundingBox();
  await page.mouse.click(gap!.x + gap!.width + 3, gap!.y + 200);
  await expect(page.getByTestId("pane-marked")).toHaveCount(0);
  await expect(bar(page)).toContainText("2 selected");
  const from = await card(page, 155).boundingBox();
  const build = await page.getByTestId("column-Build").boundingBox();
  const to = await backlog(page).boundingBox();
  await page.mouse.move(from!.x + 20, from!.y + 15);
  await page.mouse.down();
  await page.mouse.move(build!.x + 40, build!.y + 60, { steps: 6 });
  await expect(page.getByTestId("drag-ghost")).toContainText("Move demo");
  await expect(page.getByTestId("drop-note")).toHaveText("Agents move Cards here: use Hand to agent");
  await page.mouse.up();
  await expect(page.getByTestId("toast").filter({ hasText: "Agents move Cards here" })).toBeVisible();
  await expect(inbox(page).locator('[data-card="acme/app#155"]')).toHaveCount(1);
  await expect(bar(page)).toContainText("2 selected"); // a refused drop keeps the selection
  const from2 = await card(page, 155).boundingBox();
  await page.mouse.move(from2!.x + 20, from2!.y + 15);
  await page.mouse.down();
  await page.mouse.move(to!.x + 40, to!.y + 80, { steps: 6 });
  await expect(page.getByTestId("drop-note")).toHaveText("Move 2 Cards here");
  await page.mouse.up();
  await expect(page.getByTestId("toast").filter({ hasText: "Moved 2 Cards to Backlog (Specify)" })).toBeVisible();
  for (const n of [155, 156]) await expect(backlog(page).locator(`[data-card="acme/app#${n}"]`)).toContainText("Next: specify");
  await page.getByTestId("toast").filter({ hasText: "Moved 2 Cards" }).getByRole("button", { name: "Undo" }).click();
  await expect(inbox(page).locator('[data-card="acme/app#156"]')).toHaveCount(1);
});

test("m and i move the open Card; the palette lists the moves with their keys", async ({ page }) => {
  await toBoard(page);
  await card(page, 157).click();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByRole("option", { name: /Move to Inbox/ })).toContainText("i");
  await expect(page.getByRole("option", { name: /Move to Backlog/ })).toHaveCount(0); // already there, nothing to move
  await page.keyboard.press("Escape");
  await page.keyboard.press("i");
  await expect(inbox(page).locator('[data-card="acme/app#157"]')).toHaveCount(1);
  await expect(card(page, 157)).not.toContainText("Next:");
  await page.keyboard.press("m");
  await expect(backlog(page).locator('[data-card="acme/app#157"]')).toContainText("Next: specify");
});

test("a failed move rolls the Card back and says why", async ({ page }) => {
  await toBoard(page);
  await page.route("**/api/cards/**/labels", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) }));
  await card(page, 150).click();
  await page.keyboard.press("m");
  await expect(page.getByTestId("toast").filter({ hasText: "Nothing moved, 1 failed: boom" })).toBeVisible();
  await expect(inbox(page).locator('[data-card="acme/app#150"]')).toHaveCount(1);
});

test("the first click after a drag is not swallowed: ctrl-click selects, Enter opens", async ({ page }) => {
  await toBoard(page);
  const from = await card(page, 153).boundingBox();
  const build = await page.getByTestId("column-Build").boundingBox();
  await page.mouse.move(from!.x + 20, from!.y + 15);
  await page.mouse.down();
  await page.mouse.move(build!.x + 40, build!.y + 60, { steps: 6 });
  await page.mouse.up(); // refused drop: the release click lands on a common ancestor, not the Card
  await card(page, 154).click({ modifiers: [ctrl] });
  await expect(card(page, 154)).toHaveAttribute("data-marked", "true"); // the open Card, if any, joins; either way the bar shows
  await expect(bar(page)).toBeVisible();
  await card(page, 154).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Move demo E" })).toBeVisible();
  await expect(bar(page)).toBeHidden(); // a plain activation opens the Card and clears the selection
});

test("one selected Card: the Selection bar does not cover the Card pane or the Waiting list", async ({ page }) => {
  await toBoard(page);
  await card(page, 150).click();
  await page.keyboard.press("x");
  await expect(bar(page)).toContainText("1 selected");
  const barTop = (await bar(page).boundingBox())!.y;
  const pane = page.locator(".pane.aside");
  await expect(pane).toBeVisible();
  const paneBody = await pane.locator(".pane-body").boundingBox();
  expect(paneBody!.y + paneBody!.height).toBeLessThanOrEqual(barTop);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Waiting on me/ }).first().click();
  const rows = page.getByTestId("waiting-list").locator(".qrow");
  await rows.first().click();
  await page.keyboard.press("x");
  await expect(bar(page)).toContainText("1 selected");
  const list = page.getByTestId("waiting-list");
  await list.evaluate((el) => (el.scrollTop = el.scrollHeight));
  const last = await rows.last().boundingBox();
  expect(last!.y + last!.height).toBeLessThanOrEqual((await bar(page).boundingBox())!.y);
});
