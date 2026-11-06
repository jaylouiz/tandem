import { expect, test, type Page } from "./fixtures.ts";

// Waiting on me and Seen (#30, #31, #32). Look Cards 160-165 belong to these tests;
// 108 and 119 are the unseen demo Looks: opening them with a click, j or k marks them Seen.
const row = (page: Page, n: number) => page.locator(`[data-card="acme/app#${n}"]`);
const rowButton = (page: Page, n: number) => row(page, n).locator("xpath=..").getByRole("button", { name: "Mark Seen" });
const list = (page: Page) => page.getByTestId("waiting-list");
const detail = (page: Page) => page.getByTestId("detail");
const mod = process.platform === "darwin" ? "Meta" : "Control";
const toast = (page: Page, text: string) => page.getByTestId("toast").filter({ hasText: text });
/** Opens a Card through the palette: it opens the Card but does not mark a Look Seen. */
const viaPalette = async (page: Page, text: string) => {
  await expect(page.getByTestId("waiting-list").locator(".qrow").first()).toBeVisible(); // the Board has loaded
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByPlaceholder("Type a command or search Cards…")).toBeFocused();
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
};

test("every page starts with the Card pane closed; entering Waiting on me opens nothing", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("waiting")).toContainText("Select a Card");
  await expect(list(page).locator('.qrow[aria-selected="true"]')).toHaveCount(0);
  await row(page, 117).click();
  await expect(detail(page)).toHaveAttribute("aria-label", "Card acme/app#117");
  // the Board shows no pane for the Card opened in Waiting on me
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await expect(page.getByTestId("board")).toBeVisible();
  await expect(detail(page)).toHaveCount(0);
  // a Card selected on the Board does not follow to Waiting on me, where it is not listed
  await page.getByTestId("board").locator("[data-card]").first().click();
  await expect(detail(page)).toBeVisible();
  await page.getByRole("button", { name: /^Waiting on me/ }).click();
  await expect(page.getByTestId("waiting")).toContainText("Select a Card");
  await expect(detail(page)).toHaveCount(0);
  // g keys reset too; the reloaded view (localStorage) starts closed
  await row(page, 117).click();
  await page.keyboard.press("g");
  await page.keyboard.press("b");
  await expect(page.getByTestId("board")).toBeVisible();
  await expect(detail(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("board")).toBeVisible();
  await expect(detail(page)).toHaveCount(0);
  await page.keyboard.press("g");
  await page.keyboard.press("w");
  await expect(page.getByTestId("waiting")).toContainText("Select a Card");
});

test("a Card opened from the palette while on Waiting on me stays open there, listed or not", async ({ page }) => {
  await page.goto("/");
  await viaPalette(page, "Tag colors");
  await expect(detail(page)).toHaveAttribute("aria-label", "Card acme/app#107");
  await expect(row(page, 107)).toHaveCount(0); // not a blocker: not listed, still open
  await page.waitForTimeout(300);
  await expect(detail(page)).toHaveAttribute("aria-label", "Card acme/app#107");
});

test("opening a To look at Card marks it Seen: it stays listed while open and leaves when another opens", async ({ page }) => {
  await page.goto("/");
  const seen = page.waitForResponse((r) => r.url().endsWith("/160/seen") && r.request().method() === "POST");
  await row(page, 160).click();
  expect((await seen).request().postDataJSON()).toEqual({ seen: true });
  await expect(detail(page)).toHaveAttribute("aria-label", "Card acme/app#160");
  await expect(row(page, 160)).toHaveAttribute("aria-selected", "true"); // does not jump out while open
  await expect(rowButton(page, 160)).toHaveCount(0); // already Seen
  await expect(page.getByTestId("panel-look").getByRole("button", { name: /Mark (Seen|unseen)/ })).toHaveCount(0);
  // the palette offers the undo on the open Card, and no Mark Seen
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByRole("option", { name: "Mark unseen" })).toBeVisible();
  await expect(page.getByRole("option", { name: /^Mark Seen/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  // opening another Card ends it: 160 leaves To look at, and stays Seen after a reload
  await row(page, 117).click();
  await expect(row(page, 160)).toHaveCount(0);
  await page.reload();
  await expect(row(page, 160)).toHaveCount(0);
});

test("j opens the next To look at Card and marks it Seen; a Card opened from the palette is not marked", async ({ page }) => {
  await page.goto("/");
  await viaPalette(page, "Seen demo: key neighbours a");
  await expect(detail(page)).toHaveAttribute("aria-label", "Card acme/app#164");
  await page.waitForTimeout(300);
  await expect(rowButton(page, 164)).toBeVisible(); // opened, not marked
  await page.keyboard.press("j");
  await expect(detail(page)).toHaveAttribute("aria-label", "Card acme/app#165");
  await expect(row(page, 165)).toHaveAttribute("aria-selected", "true");
  await expect(rowButton(page, 165)).toHaveCount(0);
  await page.reload();
  await expect(row(page, 165)).toHaveCount(0);
  await expect(row(page, 164)).toBeVisible();
});

test("the row button marks a To look at Card Seen without opening it; a failure rolls it back with a message", async ({ page }) => {
  await page.goto("/");
  const btn = rowButton(page, 161);
  await expect(btn).not.toHaveAttribute("aria-keyshortcuts", /.+/); // `l` marks the selection, not this row: no key is advertised (#46)
  await page.route("**/api/cards/acme/app/161/seen", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) }));
  await btn.click();
  await expect(toast(page, "Not marked Seen: boom")).toBeVisible();
  await expect(row(page, 161)).toBeVisible(); // back in the list
  await page.unroute("**/api/cards/acme/app/161/seen");
  await btn.click();
  await expect(row(page, 161)).toHaveCount(0);
  await expect(detail(page)).toHaveCount(0); // it did not open the Card
  await expect(toast(page, "Marked Seen")).toBeVisible();
  await toast(page, "Marked Seen").getByRole("button", { name: "Undo" }).click(); // Undo brings it back
  await expect(row(page, 161)).toBeVisible();
});

test("mark two To look at rows, Mark Seen from the Selection bar: both leave; Esc clears marks; rows keep their size", async ({ page }) => {
  await page.goto("/");
  const bar = page.getByTestId("markbar");
  const before = await row(page, 162).boundingBox();
  await row(page, 162).click({ modifiers: [mod] });
  await row(page, 163).click({ modifiers: [mod] });
  await expect(bar).toContainText("2 selected");
  await expect(row(page, 162)).toHaveAttribute("data-marked", "true");
  expect((await row(page, 162).boundingBox())!.height).toBe(before!.height); // marking does not change the row size
  await expect(detail(page)).toHaveCount(0); // marking opens nothing
  // actions that cannot apply to Done Cards are left out of the bar here; what applies stays
  for (const name of [/Move to Backlog/, /Move to Inbox/, /^Hold/, /Hand to agent/]) await expect(bar.getByRole("button", { name })).toHaveCount(0);
  await expect(bar.getByLabel("Next step for moved Cards")).toHaveCount(0);
  await expect(bar.getByRole("button", { name: /Mark Seen/ })).toBeEnabled();
  await expect(bar.getByRole("button", { name: "Clear" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(bar).toBeHidden();
  await expect(row(page, 162)).not.toHaveAttribute("data-marked", "true");
  // shift extends within the group
  await row(page, 163).click({ modifiers: [mod] });
  await row(page, 162).click({ modifiers: ["Shift"] });
  await expect(bar).toContainText("2 selected");
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByRole("option", { name: /Mark Seen/ })).toContainText("l");
  await page.keyboard.press("Escape");
  const calls: string[] = [];
  page.on("request", (r) => r.method() === "POST" && r.url().endsWith("/seen") && calls.push(r.url()));
  await bar.getByRole("button", { name: /Mark Seen/ }).click();
  await expect(row(page, 162)).toHaveCount(0);
  await expect(row(page, 163)).toHaveCount(0);
  await expect(bar).toBeHidden();
  await expect(toast(page, "2 Cards marked Seen")).toBeVisible();
  expect(calls).toHaveLength(2);
  await toast(page, "2 Cards marked Seen").getByRole("button", { name: "Undo" }).click();
  await expect(row(page, 162)).toBeVisible();
  await expect(row(page, 163)).toBeVisible();
});

test("the key l marks the marked Cards Seen; one failure rolls back with one message", async ({ page }) => {
  await page.goto("/");
  await page.route("**/api/cards/acme/app/163/seen", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) }));
  await row(page, 162).click({ modifiers: [mod] });
  await row(page, 163).click({ modifiers: [mod] });
  await page.keyboard.press("l");
  await expect(row(page, 162)).toHaveCount(0);
  await expect(row(page, 163)).toBeVisible(); // rolled back
  await expect(toast(page, "1 of 2 marked Seen. Failed: boom")).toBeVisible();
  await expect(page.getByTestId("markbar")).toBeHidden();
});
