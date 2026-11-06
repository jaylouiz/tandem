import { expect, test, WRITE, type Page } from "./fixtures.ts";

// Feedback stability (#39, #40, #51). Uses Cards 170-177 (see src/core/fixtures.ts).
const row = (page: Page, n: number) => page.locator(`[data-card="acme/app#${n}"]`);
const list = (page: Page) => page.getByTestId("waiting-list");
const detail = (page: Page) => page.getByTestId("detail");
const isOpen = (page: Page, n: number) => expect(detail(page)).toHaveAttribute("aria-label", `Card acme/app#${n}`);
const outside = (page: Page, n: number, path: string, data: object) => page.request.post(`/api/cards/acme/app/${n}/${path}`, { data, headers: WRITE });
const board = (page: Page) => page.getByRole("button", { name: "Board", exact: true }).click();
const waiting = (page: Page) => page.getByRole("button", { name: /^Waiting on me/ }).click();
const ready = (page: Page) => expect(list(page).locator(".qrow").first()).toBeVisible();

test("#39: an answer that arrives from outside leaves the open Card open and shows its new state; no row is highlighted", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await row(page, 170).click();
  await isOpen(page, 170);
  await page.getByTestId("panel-decision").locator("textarea").fill("half typed");
  await outside(page, 170, "answer", { requestId: "D1", answer: "B", push: false });
  await expect(row(page, 170).locator(".kind-chip")).toHaveText("Awaiting pickup"); // the snapshot arrived: it is no blocker any more
  await expect(page.getByTestId("awaiting-pickup")).toBeVisible(); // the pane shows the new state
  await page.waitForTimeout(400); // nothing opens a different Card a moment later
  await isOpen(page, 170);
  await expect(list(page).locator('.qrow[aria-selected="true"]')).toHaveCount(1); // the Card is still listed (Awaiting pickup) and is the open one
  // an answer given here still opens the next blocker
  await row(page, 171).click();
  await page.getByTestId("panel-decision").getByRole("button", { name: /A: first/ }).click();
  await page.getByTestId("panel-decision").getByRole("button", { name: "Answer" }).click();
  await expect(detail(page)).not.toHaveAttribute("aria-label", "Card acme/app#171");
  await expect(detail(page)).toHaveAttribute("aria-label", /#\d+$/);
});

test("#39: a snapshot never scrolls the list; a changed selection does", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 420 });
  await page.goto("/");
  await ready(page);
  await row(page, 173).click(); // the second blocker: it ends up above the visible part of the list
  const scrollTop = () => list(page).evaluate((el) => el.scrollTop);
  await expect.poll(() => list(page).evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(300);
  await list(page).evaluate((el) => (el.scrollTop = 500));
  const top = await scrollTop();
  expect(top).toBeGreaterThan(300);
  const selectedOutOfView = await list(page).evaluate((el) => {
    const r = el.querySelector('[aria-selected="true"]')!.getBoundingClientRect();
    return r.bottom < el.getBoundingClientRect().top;
  });
  expect(selectedOutOfView).toBe(true);
  // a snapshot that changes the list's length (a Look marked Seen from elsewhere)
  await expect(row(page, 176)).toBeVisible();
  await outside(page, 176, "seen", { seen: true });
  await expect(row(page, 176)).toHaveCount(0);
  await page.waitForTimeout(400);
  expect(await scrollTop()).toBe(top);
  // the selection changing does scroll
  await page.keyboard.press("j");
  await expect.poll(() => list(page).evaluate((el) => {
    const r = el.querySelector('[aria-selected="true"]')!.getBoundingClientRect();
    const l = el.getBoundingClientRect();
    return r.top >= l.top - 1 && r.bottom <= l.bottom + 1;
  })).toBe(true);
});

test("#40: drafts of every panel survive Card switches, view changes and snapshots", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  const decision = page.getByTestId("panel-decision");
  const round = page.getByTestId("panel-design-round");
  const pr = page.getByTestId("panel-pr-approval");
  await row(page, 175).click();
  await round.getByRole("button", { name: "Pick" }).nth(1).click();
  await round.getByRole("button", { name: "Reject" }).nth(2).click();
  await round.locator("textarea").fill("round note");
  await row(page, 173).click();
  await pr.getByRole("button", { name: /Hold/ }).click();
  await pr.locator("textarea").fill("pr note");
  await row(page, 172).click();
  await decision.getByRole("button", { name: /B: second/ }).click();
  await decision.locator("textarea").fill("decision note");
  await decision.getByTestId("push-toggle").uncheck();
  // another Card, then back
  await row(page, 175).click();
  await expect(round.getByRole("button", { name: "Pick" }).nth(1)).toHaveClass(/selected/);
  await expect(round.getByRole("button", { name: "Pick" }).first()).not.toHaveClass(/selected/);
  await expect(round.getByRole("button", { name: "Reject" }).nth(2)).toHaveClass(/selected/);
  await expect(round.locator("textarea")).toHaveValue("round note");
  await row(page, 173).click();
  await expect(pr.getByRole("button", { name: /Hold/ })).toHaveClass(/selected/);
  await expect(pr.locator("textarea")).toHaveValue("pr note");
  // a snapshot (a label from elsewhere) while typing
  await row(page, 172).click();
  await decision.locator("textarea").focus();
  await page.keyboard.press("End");
  await page.keyboard.type(" and more");
  await page.request.post("/api/cards/acme/app/172/labels", { data: { add: ["stability-touch"] }, headers: WRITE }); // a new snapshot
  await expect.poll(async () => ((await (await page.request.get("/api/board")).json()) as { cards: { key: string; labels: string[] }[] }).cards.find((c) => c.key === "acme/app#172")!.labels).toContain("stability-touch");
  await page.waitForTimeout(400); // the snapshot reached the page
  await expect(decision.locator("textarea")).toHaveValue("decision note and more");
  // another view, then back
  await board(page);
  await expect(page.getByTestId("board")).toBeVisible();
  await waiting(page);
  await ready(page);
  await row(page, 172).click();
  await expect(decision.getByRole("button", { name: /B: second/ })).toHaveClass(/selected/);
  await expect(decision.locator("textarea")).toHaveValue("decision note and more");
  await expect(decision.getByTestId("push-toggle")).not.toBeChecked();
  // an answer given elsewhere: the Card shows its new state, the panel and its draft are gone
  await outside(page, 172, "answer", { requestId: "D1", answer: "B", push: false });
  await expect(row(page, 172).locator(".kind-chip")).toHaveText("Awaiting pickup");
  await expect(decision).toHaveCount(0);
});

test("#40: the agent decision pick survives a Card switch", async ({ page }) => {
  await page.goto("/");
  await board(page);
  await row(page, 174).click();
  await page.keyboard.press("]");
  const panel = page.getByTestId("panel-agent-decision");
  await panel.getByRole("button", { name: /Accept all/ }).click();
  await expect(panel.getByRole("button", { name: /Accept all/ })).toHaveClass(/selected/);
  await row(page, 175).click();
  await row(page, 174).click();
  await page.keyboard.press("]");
  await expect(panel.getByRole("button", { name: /Accept all/ })).toHaveClass(/selected/);
});

test("#51: a click on Approve, Hold or Send back only picks; Send writes once", async ({ page }) => {
  const sent: string[] = [];
  page.on("request", (r) => r.method() === "POST" && r.url().endsWith("/177/pr") && sent.push(r.postData() ?? ""));
  await page.goto("/");
  await ready(page);
  await row(page, 177).click();
  const pr = page.getByTestId("panel-pr-approval");
  const send = pr.getByRole("button", { name: "Send", exact: true });
  await expect(send).toBeDisabled(); // nothing picked
  await pr.getByRole("button", { name: /Approve/ }).click();
  await expect(pr.getByRole("button", { name: /Approve/ })).toHaveClass(/selected/); // the same state as pressing 1
  await pr.getByRole("button", { name: /Hold/ }).click();
  await expect(pr.getByRole("button", { name: /Hold/ })).toHaveClass(/selected/);
  await expect(pr.getByRole("button", { name: /Approve/ })).not.toHaveClass(/selected/); // one pick
  await pr.getByRole("button", { name: /Send back/ }).click();
  await expect(send).toBeDisabled(); // send back needs the note
  await page.waitForTimeout(300);
  expect(sent).toHaveLength(0); // clicking wrote nothing
  await expect(page.getByTestId("toast")).toHaveCount(0);
  await pr.locator("textarea").fill("needs a test");
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByTestId("toast").filter({ hasText: "Feedback given" })).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0]).toContain("send-back");
});

test("#51: Accept all picks and Send writes, in Decided", async ({ page }) => {
  const sent: string[] = [];
  page.on("request", (r) => r.method() === "POST" && r.url().endsWith("/174/accept") && sent.push(r.url()));
  await page.goto("/");
  await board(page);
  await row(page, 174).click();
  await page.keyboard.press("]");
  const panel = page.getByTestId("panel-agent-decision");
  const send = panel.getByRole("button", { name: "Send", exact: true });
  await expect(send).toBeDisabled();
  await panel.getByRole("button", { name: /Accept all/ }).click();
  await expect(panel.getByRole("button", { name: /Accept all/ })).toHaveClass(/selected/);
  await page.waitForTimeout(300);
  expect(sent).toHaveLength(0);
  await send.click();
  await expect(page.getByTestId("toast").filter({ hasText: "Feedback given" })).toBeVisible();
  expect(sent).toHaveLength(1);
});
