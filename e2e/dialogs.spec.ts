import { expect, test, type Locator, type Page } from "./fixtures.ts";

// One dialog behaviour (#42, ADR 0005): Palette, Capture, Agent activity and the Gallery come from one wrapper (src/web/ui/Dialog.tsx).
// Read-only on the fixture data: nothing is captured or sent here (the last test stubs the write for Cards 178-179).
const PALETTE = "Command palette";
const CAPTURE = "Capture an idea";
const AGENTS = "Agent activity";
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name });
const boardLoaded = async (page: Page) => {
  await page.goto("/");
  await expect(page.getByTestId("agents-line")).toContainText(/\d+ working/);
};
/** Focus sits inside the dialog right now; the library moves it over a frame or two, so callers poll. */
const focusInside = (d: Locator) => d.evaluate((el) => el.contains(document.activeElement));
/** Tab and Shift+Tab walk past the last and first stop of the dialog without ever leaving it. */
async function trapsFocus(page: Page, d: Locator) {
  await expect.poll(() => focusInside(d)).toBe(true);
  for (const key of ["Tab", "Shift+Tab"]) {
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press(key);
      await expect.poll(() => focusInside(d)).toBe(true);
    }
  }
}
/** The Gallery of the demo Card #110, opened from the palette like a developer would. */
async function openGallery(page: Page) {
  await page.goto("/");
  await page.locator('[data-card="acme/app#110"]').click();
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("Open screenshots");
  await page.keyboard.press("Enter");
  return page.getByTestId("gallery");
}

const OPENERS: [string, string, (page: Page) => Promise<void>][] = [
  [PALETTE, "Board", (page) => page.keyboard.press("ControlOrMeta+k")],
  [CAPTURE, "Board", (page) => page.keyboard.press("c")],
  [AGENTS, "Board", async (page) => (await page.keyboard.press("g"), page.keyboard.press("a"))],
];

for (const [name, focusFirst, open] of OPENERS) {
  test(`${name}: modal, Tab stays inside, Esc closes from inside, focus goes back to the opener`, async ({ page }) => {
    await boardLoaded(page);
    const opener = page.getByRole("button", { name: focusFirst, exact: true });
    await opener.focus();
    await open(page);
    const d = dialog(page, name);
    await expect(d).toBeVisible();
    await expect(d).toHaveAttribute("aria-modal", "true");
    await trapsFocus(page, d);
    await page.keyboard.press("Escape");
    await expect(d).toBeHidden();
    await expect(opener).toBeFocused();
  });
}

test("Gallery: modal, Tab stays inside, Esc closes, focus goes back to where the Palette that opened it was opened", async ({ page }) => {
  const gallery = await openGallery(page);
  await expect(gallery).toBeVisible();
  await expect(gallery).toHaveAttribute("aria-modal", "true");
  await expect(gallery).toHaveAttribute("role", "dialog");
  await trapsFocus(page, gallery);
  await page.keyboard.press("Escape");
  await expect(gallery).toBeHidden();
  await expect(page.locator('[data-card="acme/app#110"]')).toBeFocused(); // the row clicked before ⌘K, not `body`
});

test("Capture: Esc closes from every field, also with text typed in, and the text is kept for the next Capture", async ({ page }) => {
  await boardLoaded(page);
  await page.keyboard.press("c");
  const d = dialog(page, CAPTURE);
  await expect(d.getByPlaceholder("Title")).toBeFocused();
  await page.keyboard.type("Half an idea");
  await page.keyboard.press("Escape");
  await expect(d).toBeHidden();
  await page.keyboard.press("c");
  await expect(d.getByPlaceholder("Title")).toHaveValue("Half an idea");
  await d.getByPlaceholder("Details (optional)").focus();
  await page.keyboard.press("Escape"); // from the details field, not only the dialog body
  await expect(d).toBeHidden();
  await d.getByPlaceholder("Title").waitFor({ state: "detached" });
});

test("typing right after ⌘K or c lands in the field: the library's focus move comes a frame later", async ({ page }) => {
  await boardLoaded(page);
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("Open screenshots", { delay: 0 });
  await expect(page.getByPlaceholder("Type a command or search Cards…")).toHaveValue("Open screenshots");
  await page.keyboard.press("Escape");
  await page.keyboard.press("c");
  await page.keyboard.type("An idea", { delay: 0 });
  await expect(dialog(page, CAPTURE).getByPlaceholder("Title")).toHaveValue("An idea");
});

test("only one modal at a time: ⌘K over Capture or the Gallery does nothing, a Palette command replaces the Palette", async ({ page }) => {
  await boardLoaded(page);
  await page.keyboard.press("c");
  await expect(dialog(page, CAPTURE)).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(dialog(page, CAPTURE)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByPlaceholder("Type a command or search Cards…")).toBeHidden(); // Capture's Esc did not leave a Palette behind
  // a command that opens another dialog replaces the Palette; Esc then leaves nothing open and focus where the Palette was opened
  const opener = page.getByRole("button", { name: "Board", exact: true });
  await opener.focus();
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("Capture an idea");
  await page.keyboard.press("Enter");
  await expect(dialog(page, CAPTURE)).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(opener).toBeFocused();
  // the Gallery is a modal too
  const gallery = await openGallery(page);
  await expect(gallery).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(gallery).toBeVisible();
});

test("Esc inside a dialog closes only the dialog: the open Card stays open and the selection stays marked", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Board", exact: true }).click();
  const card = page.locator(".card").first();
  await card.click();
  await page.keyboard.press("x");
  await page.keyboard.press("ControlOrMeta+k");
  await expect(dialog(page, PALETTE)).toBeVisible();
  await expect(page.getByPlaceholder("Type a command or search Cards…")).toBeFocused(); // cmdk's input has the focus in the Dialog
  await page.keyboard.press("Escape");
  await expect(dialog(page, PALETTE)).toBeHidden();
  await expect(page.getByTestId("detail")).toBeVisible();
  await expect(card).toHaveAttribute("data-marked", "true");
  await expect(card).toBeFocused(); // the opener of the Palette
});

test("closing the Card pane returns focus to the Card that opened it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Board", exact: true }).click();
  const card = page.locator(".card").nth(2);
  const key = await card.getAttribute("data-card");
  await card.click();
  await expect(page.getByTestId("detail")).toBeVisible();
  await page.getByTestId("detail").getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("detail")).toBeHidden();
  await expect(page.locator(`.card[data-card="${key}"]`)).toBeFocused();
  // by keyboard: Esc from the Close button
  await card.click();
  await page.getByTestId("detail").getByRole("button", { name: "Close" }).focus();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("detail")).toBeHidden();
  await expect(page.locator(`.card[data-card="${key}"]`)).toBeFocused();
});

test("⌘↵ in the Gallery sends its own Card's reaction once and nothing for the Card that opens next", async ({ page }) => {
  // The Gallery closes inside React's flush, before the window key handler runs: a key handled in a dialog must still count as dialog-owned (#42).
  const writes: string[] = [];
  await page.route("**/api/cards/**/round", async (route) => {
    writes.push(new URL(route.request().url()).pathname);
    await route.fulfill({ json: { push: null } }); // a stub: the fixture Cards stay untouched
  });
  await page.goto("/");
  const waiting = page.getByTestId("waiting-list");
  await expect(waiting.locator(".qrow").first()).toBeVisible();
  await waiting.locator('[data-card="acme/app#179"]').click();
  await page.getByTestId("panel-design-round").getByRole("button", { name: "Pick" }).first().click(); // #179 (the next one in the list) has a chosen reaction ready to send
  await waiting.locator('[data-card="acme/app#178"]').click();
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("Open screenshots");
  await page.keyboard.press("Enter");
  const gallery = page.getByTestId("gallery");
  await expect(gallery).toBeFocused(); // its keys are the popup's: they need the focus in it
  await page.keyboard.press("p");
  await expect(gallery).toContainText("picked");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(gallery).toBeHidden();
  await page.waitForTimeout(500); // a leaked key would have written by now
  expect(writes).toEqual(["/api/cards/acme/app/178/round"]);
});
