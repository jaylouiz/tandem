import { expect, test, toast, type Page } from "./fixtures.ts";

// The Card sheet (#17): one page without tabs. One head line (repo and number, the Phase as a track, what is exceptional, More), the title,
// what the Card asks, then Issue, Decided and Activity as folds that open in place. Also #20 (never "now ago").
const detail = (page: Page) => page.getByTestId("detail");
const fold = (page: Page, id: "issue" | "decided" | "activity") => detail(page).getByTestId(`fold-${id}`);
const head = (page: Page, id: "issue" | "decided" | "activity") => fold(page, id).locator(".fold-head");
const open = async (page: Page, n: number, view: "waiting" | "board" = "waiting", repo = "acme/app") => {
  await page.goto(`/${view}/${repo}/${n}`);
  await expect(detail(page)).toHaveAttribute("aria-label", `Card ${repo}#${n}`);
};
const more = (page: Page) => detail(page).getByTestId("more");
const menu = (page: Page) => page.getByTestId("more-menu");

test("a Card that waits on me opens with the ask directly under the title: no tab to choose, nothing said twice", async ({ page }) => {
  await open(page, 105);
  const d = detail(page);
  await expect(d.getByRole("tab")).toHaveCount(0); // no tabs (a one-question ask has no steps either)
  // the title, then the ask panel: the first thing in the body
  await expect(d.locator(".sheet-head h2")).toHaveText("Sync conflicts lose edits");
  await expect(d.locator(".sheet-body > :first-child").getByTestId("panel-decision")).toBeVisible();
  // repo and number, the Phase and the Next step each at most once; no kind chip, no Priority, no coordinator line
  await expect(d.getByText("#105", { exact: true })).toHaveCount(1);
  await expect(d.getByTestId("phase")).toHaveCount(1);
  await expect(d.getByText(/\bBuild\b/)).toHaveCount(1);
  await expect(d.locator(".kind-chip, .chip.waiting")).toHaveCount(0);
  await expect(d.getByText(/Next: |Next step/)).toHaveCount(0);
  await expect(d.getByText(/Priority|P[123]\b|coordinator/i)).toHaveCount(0);
  await expect(d.getByTestId("triage")).toHaveCount(0);
});

test("the Phase reads as a five-segment track with the current Phase named; it is not a control", async ({ page }) => {
  await open(page, 183);
  const phase = detail(page).getByTestId("phase");
  await expect(phase).toHaveText("Phase: UX Design"); // "Phase: " is there for screen readers only
  await expect(phase.locator(".sr-only")).toHaveText("Phase:");
  await expect(phase).toHaveAttribute("title", "Phase 3 of 5: Inbox, Backlog, UX Design, Build, Done");
  await expect(phase.locator(".phase-track i")).toHaveCount(5);
  await expect(phase.locator('.phase-track i[data-state="past"]')).toHaveCount(2);
  await expect(phase.locator('.phase-track i[data-state="now"]')).toHaveCount(1);
  // nothing to click, no path to follow
  await expect(phase.locator("a, button, svg")).toHaveCount(0);
  expect(await phase.evaluate((el) => el.closest("a, button"))).toBeNull();
});

test("the More menu holds Next step (the current one checked), Hold Card and Open on GitHub, each with its key", async ({ page }) => {
  await open(page, 103, "board"); // Backlog, Next step: specify
  await expect(more(page)).toHaveAccessibleName("More actions");
  await more(page).click();
  const m = menu(page);
  await expect(m).toBeVisible();
  await expect(m.getByRole("menuitemradio")).toHaveText(["designd", "specifys", "buildb"]);
  await expect(m.getByRole("menuitemradio", { name: /specify/ })).toHaveAttribute("aria-checked", "true");
  await expect(m.getByRole("menuitemradio", { name: /design/ })).toHaveAttribute("aria-checked", "false");
  await expect(m.getByRole("menuitem")).toHaveText(["Hold Cardh", "Open on GitHubo"]); // Needs wayfinder is for Inbox Cards
  // arrow keys walk it, Esc closes it and gives the button the keyboard back
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(m).toHaveCount(0);
  await expect(more(page)).toBeFocused();
  await expect(detail(page)).toBeVisible(); // Esc closed the menu, not the Card
  // a click on an item runs it
  await more(page).click();
  await m.getByRole("menuitemradio", { name: /build/ }).click();
  await expect(toast(page, "Next step: build")).toBeVisible();
  await expect(m).toHaveCount(0);
  await more(page).click();
  await expect(m.getByRole("menuitemradio", { name: /build/ })).toHaveAttribute("aria-checked", "true");
  // with the menu open the key on an item runs it too
  await expect(m).toBeFocused(); // its keys are the popup's: they need the focus in it
  await page.keyboard.press("d");
  await expect(m).toHaveCount(0);
  await expect(toast(page, "Next step: design")).toBeVisible();
});

test("d, s, b, h, w and o work with the menu closed", async ({ page }) => {
  await open(page, 101, "board"); // Inbox
  await expect(menu(page)).toHaveCount(0);
  await page.keyboard.press("w");
  await expect(detail(page).locator(".sheet-top .chip", { hasText: "Needs wayfinder" })).toBeVisible();
  await expect(detail(page).getByTestId("fog-hint")).toContainText("Needs wayfinder: run /wayfinder 101 in a terminal");
  await more(page).click();
  await expect(menu(page).getByRole("menuitem")).toHaveText(["Hold Cardh", "Clear Needs wayfinderw", "Open on GitHubo"]);
  await expect(menu(page).getByRole("menuitemradio")).toHaveCount(0); // no Next step while it needs wayfinder
  await page.keyboard.press("Escape");
  await page.keyboard.press("w");
  await expect(detail(page).getByTestId("fog-hint")).toHaveCount(0);
  await page.keyboard.press("h");
  await expect(detail(page).locator(".sheet-top .chip", { hasText: "On hold" })).toBeVisible();
  await more(page).click();
  await expect(menu(page).getByRole("menuitem", { name: /Release hold/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("h");
  await expect(detail(page).locator(".sheet-top .chip", { hasText: "On hold" })).toHaveCount(0);
  for (const [key, step] of [["s", "specify"], ["b", "build"], ["d", "design"]] as const) {
    await page.keyboard.press(key);
    await expect(detail(page).getByTestId("hand-row")).toContainText(`Next step: ${step}`);
  }
  const popup = page.waitForEvent("popup");
  await page.keyboard.press("o");
  expect((await popup).url()).toContain("github.com/acme/app/issues/101");
});

test("folds: a one-line summary, a click or Enter opens in place; they start from what is new", async ({ page }) => {
  // something waits: Issue closed with its summary, Activity closed
  await open(page, 183);
  await expect(head(page, "issue")).toHaveAttribute("aria-expanded", "false");
  await expect(fold(page, "issue").locator(".fold-sum")).toHaveText(/^Problem Connecting Notion and Reminders are two different flows today/);
  await expect(head(page, "activity")).toHaveAttribute("aria-expanded", "false");
  await expect(fold(page, "decided")).toHaveCount(0); // nothing decided yet: no Decided fold
  await head(page, "issue").click();
  await expect(head(page, "issue")).toHaveAttribute("aria-expanded", "true");
  await expect(fold(page, "issue").locator(".fold-body h2").first()).toHaveText("Problem"); // the Markdown, rendered, in place
  await expect(detail(page).getByTestId("panel-design-round")).toBeVisible(); // the ask stays where it is
  await head(page, "issue").focus();
  await page.keyboard.press("Enter");
  await expect(head(page, "issue")).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await expect(head(page, "issue")).toHaveAttribute("aria-expanded", "true");

  // it holds a new agent decision: Decided starts open, and says so
  await open(page, 127);
  await expect(head(page, "decided")).toHaveAttribute("aria-expanded", "true");
  await expect(fold(page, "decided").getByTestId("panel-agent-decision")).toBeVisible();
  await expect(head(page, "issue")).toHaveAttribute("aria-expanded", "false");
  await head(page, "decided").click();
  await expect(fold(page, "decided").locator(".fold-sum")).toHaveText("3 agent decisions, 2 new");

  // nothing waits: no ask panel, the issue text starts open
  await open(page, 112, "board");
  await expect(detail(page).getByTestId("sheet-ask")).toBeEmpty();
  await expect(head(page, "issue")).toHaveAttribute("aria-expanded", "true");
  await expect(fold(page, "issue")).toContainText("Undo a delete for 10 seconds.");
});

test("Activity: the state said once in its summary; the coordination log on demand, with its empty state", async ({ page }) => {
  await open(page, 112, "board"); // has a coordination log (e2e/logs)
  await expect(fold(page, "activity").locator(".fold-sum")).toHaveText(/^(Working|Stuck) · .+ · (just now|\d+[mhd] ago)$/);
  await head(page, "activity").click();
  await expect(fold(page, "activity").getByTestId("coordination-log").locator(".timeline li").first()).toBeVisible();
  await open(page, 105, "board");
  await expect(fold(page, "activity").locator(".fold-sum")).toHaveText(/^Parked · .+ · \d+[mhd] ago$/);
  await head(page, "activity").click();
  await expect(fold(page, "activity").getByTestId("coordination-log")).toHaveText("No coordination log for this issue.");
  // a Backlog Card has no agent activity: when it last moved
  await open(page, 130, "board");
  await expect(fold(page, "activity").locator(".fold-sum")).toHaveText(/^Moved \d+[mhd] ago$/);
});

test("the log is loading until it arrives", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/api/cards/acme/app/112/log", async (r) => {
    await held;
    await r.continue();
  });
  await open(page, 112, "board");
  await head(page, "activity").click();
  await expect(fold(page, "activity").getByTestId("coordination-log")).toHaveText("Loading…");
  release();
  await expect(fold(page, "activity").locator(".timeline li").first()).toBeVisible();
});

test("#20: right after an answer the Card says 'just now', never 'now ago'; Feedback given is one line with what was answered", async ({ page }) => {
  await page.goto("/board/acme/app/105");
  await expect(detail(page).getByTestId("panel-decision")).toBeVisible();
  await page.keyboard.press("Meta+Enter"); // the recommendation is picked from the start
  const line = detail(page).getByTestId("awaiting-pickup");
  await expect(line).toHaveText("Feedback given, awaiting pickup. You answered “Decision D1: B”, the run has not resumed.");
  await expect(detail(page).getByTestId("panel-decision")).toHaveCount(0);
  await expect(fold(page, "activity").locator(".fold-sum")).toHaveText(/^Queued · .+ · just now$/);
  await expect(detail(page)).not.toContainText("now ago");
  // the answer is in Decided, quoted as written
  await head(page, "decided").click();
  await expect(fold(page, "decided")).toContainText("Decision D1: B");
});

test("states: a Backlog Card is one line with its Next step and Hand to agent; a Done Card shows its Look and has no Activity fold", async ({ page }) => {
  await open(page, 130, "board");
  const row = detail(page).getByTestId("hand-row");
  await expect(row).toContainText("Next step: build");
  await expect(row.getByRole("button", { name: /Hand to agent/ })).toBeVisible();
  await row.getByRole("button", { name: /Hand to agent/ }).click();
  await expect(detail(page).getByTestId("handed")).toContainText(/^Handed to the coordinator · \d\d:\d\d/);

  await open(page, 108);
  await expect(detail(page).getByTestId("panel-look")).toBeVisible();
  await expect(detail(page).getByTestId("panel-look")).toContainText(/Done (just now|\d+[mhd] ago)/);
  await expect(fold(page, "activity")).toHaveCount(0);
  await expect(head(page, "issue")).toHaveAttribute("aria-expanded", "false"); // the Look stands where the ask would
});

test("an issue without a description says so, in the summary and in the fold", async ({ page }) => {
  await page.route("**/api/events*", async (route) => {
    // one snapshot with the body of #105 emptied
    const board = (await (await page.request.get("/api/board")).json()) as { cards: { key: string; body: string }[] };
    for (const c of board.cards) if (c.key === "acme/app#105") c.body = "";
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: `event: board\ndata: ${JSON.stringify(board)}\n\n` });
  });
  await open(page, 105);
  await expect(fold(page, "issue").locator(".fold-sum")).toHaveText("No description");
  await head(page, "issue").click();
  await expect(fold(page, "issue").locator(".fold-body")).toHaveText("No description.");
});

test("the sheet works in the 400px pane beside the Board at 1024: no horizontal scroll, the same structure", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  for (const n of [183, 184, 185, 105, 106, 130]) {
    await open(page, n, "board");
    const pane = detail(page);
    expect((await pane.boundingBox())!.width).toBeLessThanOrEqual(401);
    await head(page, "issue").click();
    const over = await pane.evaluate((el) => [el, ...el.querySelectorAll<HTMLElement>(".pane-body, .section.waiting, .sheet-head, .qsteps, .qsend")].filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.className));
    expect(over, `#${n}`).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `#${n} page`).toBe(true);
  }
  // the steps stay on one row: a step shows its number and letter only
  await open(page, 184, "board");
  const steps = detail(page).getByTestId("steps");
  const tops = await steps.getByRole("tab").evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))]);
  expect(tops).toHaveLength(1);
  await expect(steps.getByTestId("step-1").locator(".qstep-label")).toBeHidden();
  await expect(steps.getByTestId("step-1")).toContainText("1B");
});

test("the palette opens a fold and brings it into view; an older link with ?tab= still opens the Card", async ({ page }) => {
  await page.goto("/board/acme/app/112?tab=activity");
  await expect(detail(page)).toHaveAttribute("aria-label", "Card acme/app#112");
  await expect(page).toHaveURL(/\/board\/acme\/app\/112$/); // the parameter is gone from the address
  await expect(head(page, "activity")).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Meta+k");
  await page.getByPlaceholder(/command|search/i).fill("coordination log");
  await page.keyboard.press("Enter");
  await expect(head(page, "activity")).toHaveAttribute("aria-expanded", "true");
  await expect(fold(page, "activity").getByTestId("coordination-log")).toBeVisible();
  await page.keyboard.press("Meta+k");
  await page.getByPlaceholder(/command|search/i).fill("Show Issue");
  await page.keyboard.press("Enter");
  await expect(head(page, "issue")).toHaveAttribute("aria-expanded", "true");
  // no tab commands, no priority commands
  await page.keyboard.press("Meta+k");
  await page.getByPlaceholder(/command|search/i).fill("Tab:");
  await expect(page.getByRole("option", { name: /^Tab: / })).toHaveCount(0);
  await page.getByPlaceholder(/command|search/i).fill("Priority");
  await expect(page.getByRole("option", { name: /Priority/ })).toHaveCount(0);
});

test("the digits belong to the ask panel; on a Card without one they do nothing (no priority is set)", async ({ page }) => {
  let labels = 0;
  page.on("request", (r) => r.method() === "POST" && r.url().endsWith("/labels") && labels++);
  await open(page, 103, "board"); // Backlog, carries priority:2 from GitHub
  for (const k of ["1", "3", "0"]) await page.keyboard.press(k);
  await page.waitForTimeout(300);
  expect(labels).toBe(0);
  await expect(page.locator(".toast")).toHaveCount(0);
  await expect(page.locator('.card[data-card="acme/app#103"] .chip', { hasText: /^P2$/ })).toBeVisible(); // still read from the label, on the Board
});
