import { expect, test, type Page, toast } from "./fixtures.ts";

// Agent decisions never block the agent (agent-workflow), so they are not Waiting on me: they are in the Decided fold of the
// Card sheet, which starts open while one of them is new. This spec uses 107 (one new decision) and
// 127 (a real blocker D3, a challenged D1 and two new decisions, D2 and D4).
const row = (page: Page, n: number) => page.locator(`[data-card="acme/app#${n}"]`);
const list = (page: Page) => page.getByTestId("waiting-list");
const pane = (page: Page, n: number) => expect(page.getByTestId("detail")).toHaveAttribute("aria-label", `Card acme/app#${n}`);
const toBoard = async (page: Page) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Board", exact: true }).click();
};

test("a Card with only an agent decision is not Waiting on me: no ask panel, Decided starts open with the new decision", async ({ page }) => {
  await page.goto("/");
  await expect(row(page, 107)).toHaveCount(0);
  await expect(list(page).locator('.qrow:not([data-kind="look"]):not([data-kind="pickup"])').first()).toBeVisible(); // there are blockers
  await toBoard(page);
  await row(page, 107).click();
  await pane(page, 107);
  await expect(page.getByTestId("sheet-ask")).toBeEmpty(); // nothing is asked
  await expect(page.getByTestId("fold-decided").locator(".fold-head")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("fold-decided").getByTestId("panel-agent-decision")).toContainText("New · 1 not blocking");
  await expect(page.getByTestId("detail").locator(".section.waiting")).toHaveCount(0); // not raised: it does not wait
  await expect(page.getByTestId("detail").locator(".chip.waiting")).toHaveCount(0);
  // closed, the fold says what it holds
  await page.getByTestId("fold-decided").locator(".fold-head").click();
  await expect(page.getByTestId("fold-decided").locator(".fold-sum")).toHaveText("1 agent decision, 1 new");
});

test("a real blocker next to agent decisions stays Waiting on me for the blocker only", async ({ page }) => {
  await page.goto("/");
  await expect(row(page, 127)).toContainText("Decision");
  await expect(row(page, 127)).not.toContainText("Agent decision");
  await row(page, 127).click();
  await expect(page.getByTestId("sheet-ask").getByTestId("panel-decision")).toBeVisible(); // the ask comes first
  await expect(page.getByTestId("fold-decided").getByTestId("panel-agent-decision")).toContainText("New · 2 not blocking"); // D2, D4; D1 is challenged
  // the digits and ⌘↵ are the ask's: the agent decisions show no key
  await expect(page.getByTestId("panel-agent-decision").locator("kbd")).toHaveCount(0);
});

test("Decided lists each agent decision with its state", async ({ page }) => {
  await page.goto("/");
  await row(page, 127).click();
  await expect(page.getByTestId("fold-decided").locator(".fold-head")).toHaveAttribute("aria-expanded", "true");
  const decided = page.getByTestId("decided");
  await expect(decided.locator(".decided-row", { hasText: "D1" })).toContainText("Challenged");
  await expect(decided.getByTestId("panel-agent-decision")).toContainText("D2");
  await expect(decided.getByTestId("panel-agent-decision")).toContainText("New");
  await expect(decided.getByTestId("panel-agent-decision").locator("br").first()).toBeAttached(); // one record field per line
  // the record's heading is not repeated under the panel's own title: the id is its chip
  await expect(decided.getByTestId("panel-agent-decision")).not.toContainText("Agent decision (");
  await expect(decided.getByTestId("panel-agent-decision").locator(".agent-dec .did")).toHaveText(["D2", "D4"]);
});

test("accept from Decided by keyboard: 1, ⌘↵; the line goes and the decision reads Accepted", async ({ page }) => {
  await toBoard(page);
  await row(page, 107).click(); // nothing is asked on this Card: the agent decisions take the digits and ⌘↵
  const panel = page.getByTestId("panel-agent-decision");
  await expect(panel).toBeVisible();
  await page.keyboard.press("1");
  await expect(panel.getByRole("button", { name: /Accept all/ })).toHaveClass(/selected/);
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(toast(page, "Feedback given")).toBeVisible();
  await expect(panel).toHaveCount(0);
  await expect(page.getByTestId("decided").locator(".decided-row", { hasText: "D1" })).toContainText("Accepted");
  await page.getByTestId("fold-decided").locator(".fold-head").click();
  await expect(page.getByTestId("fold-decided").locator(".fold-sum")).toHaveText("1 agent decision"); // nothing new left
});

test("challenge from Decided on a Card that also waits: the digits stay the ask's, ⌘↵ in the field sends the challenge once; D2 stays New and the Card stays Waiting on me for D3", async ({ page }) => {
  const sent: string[] = [];
  page.on("request", (r) => r.method() === "POST" && r.url().endsWith("/challenge") && sent.push(r.postData() ?? ""));
  await page.goto("/");
  const answers: string[] = [];
  page.on("request", (r) => r.method() === "POST" && r.url().endsWith("/answer") && answers.push(r.postData() ?? ""));
  await row(page, 127).click();
  const panel = page.getByTestId("panel-agent-decision");
  await page.keyboard.press("3"); // a digit picks an option of the ask, never a challenge
  await expect(page.getByTestId("panel-decision").getByRole("radio").nth(2)).toHaveAttribute("aria-checked", "true");
  await expect(panel.getByRole("button", { name: /Challenge D4/ })).not.toHaveClass(/selected/);
  await panel.getByRole("button", { name: /Challenge D4/ }).click();
  await panel.locator("textarea").fill("Cap at 10 minutes");
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.keyboard.press("ControlOrMeta+Enter"); // a second one while it is written sends nothing: not the challenge again, not the ask
  await expect(toast(page, "Feedback given")).toBeVisible();
  await expect(page.getByTestId("decided").locator(".decided-row", { hasText: "D4" })).toContainText("Challenged");
  // D2 is still new, so the panel stays: without the challenged text and with nothing left to send twice
  await expect(panel).toContainText("D2");
  await expect(panel.locator("textarea")).toHaveCount(0);
  expect(sent).toHaveLength(1);
  expect(answers).toHaveLength(0);
  expect(sent[0]).toContain("Cap at 10 minutes");
  await expect(row(page, 127)).toContainText("Decision"); // still the blocker D3
  await expect(row(page, 127)).not.toContainText("Awaiting pickup");
});

test("a Done Card with a Look and agent decisions: the Look has the keys, the agent decisions show none", async ({ page }) => {
  // #160 is a Done Card with a Look; give it the new agent decision of #107 (no fixture has both)
  await page.route("**/api/events*", async (route) => {
    const board = (await (await page.request.get("/api/board")).json()) as { cards: Record<string, unknown>[] };
    const from = board.cards.find((c) => c.key === "acme/app#107")!;
    const to = board.cards.find((c) => c.key === "acme/app#160")!;
    Object.assign(to, { agentDecisions: from.agentDecisions, decisionsToAccept: from.decisionsToAccept });
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: `event: board\ndata: ${JSON.stringify(board)}\n\n` });
  });
  await page.goto("/board/acme/app/160");
  await expect(page.getByTestId("detail")).toHaveAttribute("aria-label", "Card acme/app#160");
  await expect(page.getByTestId("fold-decided").getByTestId("panel-agent-decision")).toBeVisible();
  await expect(page.getByTestId("panel-agent-decision").locator("kbd")).toHaveCount(0);
});
