import { expect, test, type Page } from "./fixtures.ts";

// Agent decisions never block the agent (agent-workflow), so they are not Waiting on me: a quiet line in Now,
// the decisions themselves in Decided. This spec uses 107 (one new decision) and
// 127 (a real blocker D3, a challenged D1 and two new decisions, D2 and D4).
const row = (page: Page, n: number) => page.locator(`[data-card="acme/app#${n}"]`);
const list = (page: Page) => page.getByTestId("waiting-list");
const pane = (page: Page, n: number) => expect(page.getByTestId("detail")).toHaveAttribute("aria-label", `Card acme/app#${n}`);
const toBoard = async (page: Page) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Board", exact: true }).click();
};

test("a Card with only an agent decision is not Waiting on me; Now has a quiet line, no panel", async ({ page }) => {
  await page.goto("/");
  await expect(row(page, 107)).toHaveCount(0);
  await expect(list(page).locator(".group-head", { hasText: "Waiting on me" })).toBeVisible();
  await toBoard(page);
  await row(page, 107).click();
  await pane(page, 107);
  await expect(page.getByTestId("panel-agent-decision")).toBeHidden(); // not rendered on Now
  await expect(page.getByTestId("decisions-line")).toHaveText(/^1 agent decision, not blocking/);
  await expect(page.getByTestId("detail").locator(".pane-ask")).toHaveCount(0);
  await expect(page.getByTestId("detail").locator(".chip.waiting")).toHaveCount(0);
});

test("a real blocker next to agent decisions stays Waiting on me for the blocker only", async ({ page }) => {
  await page.goto("/");
  await expect(row(page, 127)).toContainText("Decision");
  await expect(row(page, 127)).not.toContainText("Agent decision");
  await row(page, 127).click();
  await expect(page.getByTestId("panel-decision")).toBeVisible();
  await expect(page.getByTestId("decisions-line")).toHaveText(/^2 agent decisions, not blocking/); // D2, D4; D1 is challenged
  await expect(page.getByTestId("panel-agent-decision")).toBeHidden();
});

test("the quiet line opens Decided, which lists each agent decision with its state", async ({ page }) => {
  await page.goto("/");
  await row(page, 127).click();
  await page.getByTestId("decisions-line").click();
  await expect(page.getByRole("tab", { name: "Decided" })).toHaveAttribute("aria-selected", "true");
  const decided = page.getByTestId("decided");
  await expect(decided.locator(".decided-row", { hasText: "D1" })).toContainText("Challenged");
  await expect(decided.getByTestId("panel-agent-decision")).toContainText("D2");
  await expect(decided.getByTestId("panel-agent-decision")).toContainText("New");
  await expect(decided.getByTestId("panel-agent-decision").locator("br").first()).toBeAttached(); // one record field per line
});

test("accept from Decided by keyboard: 1, ⌘↵; the line goes and the decision reads Accepted", async ({ page }) => {
  await toBoard(page);
  await row(page, 107).click();
  await page.keyboard.press("]"); // Now -> Decided
  const panel = page.getByTestId("panel-agent-decision");
  await expect(panel).toBeVisible();
  await page.keyboard.press("1");
  await expect(panel.getByRole("button", { name: /Accept all/ })).toHaveClass(/selected/);
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.getByTestId("toast").filter({ hasText: "Feedback given" })).toBeVisible();
  await expect(panel).toHaveCount(0);
  await expect(page.getByTestId("decided").locator(".decided-row", { hasText: "D1" })).toContainText("Accepted");
  await page.keyboard.press("["); // back to Now: no line left
  await expect(page.getByTestId("decisions-line")).toHaveCount(0);
});

test("challenge from Decided by keyboard: 3 picks D4, ⌘↵ sends once; D2 stays New and the Card stays Waiting on me for D3", async ({ page }) => {
  const sent: string[] = [];
  page.on("request", (r) => r.method() === "POST" && r.url().endsWith("/challenge") && sent.push(r.postData() ?? ""));
  await page.goto("/");
  await row(page, 127).click();
  await page.keyboard.press("]");
  const panel = page.getByTestId("panel-agent-decision");
  await page.keyboard.press("3");
  await expect(panel.getByRole("button", { name: /Challenge D4/ })).toHaveClass(/selected/);
  await panel.locator("textarea").fill("Cap at 10 minutes");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.getByTestId("toast").filter({ hasText: "Feedback given" })).toBeVisible();
  await expect(page.getByTestId("decided").locator(".decided-row", { hasText: "D4" })).toContainText("Challenged");
  // D2 is still new, so the panel stays: without the challenged text and with nothing left to send twice
  await expect(panel).toContainText("D2");
  await expect(panel.locator("textarea")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(panel.locator("textarea")).toHaveCount(0);
  expect(sent).toHaveLength(1);
  expect(sent[0]).toContain("Cap at 10 minutes");
  await expect(row(page, 127)).toContainText("Decision"); // still the blocker D3
  await expect(row(page, 127)).not.toContainText("Awaiting pickup");
});
