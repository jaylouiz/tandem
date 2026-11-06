import { expect, test } from "./fixtures.ts";

// Every test starts on boot-state demo data (e2e/fixtures.ts).

/** Opens the Look Card #108 through the palette: a click on a To look at row would mark it Seen; seen.spec.ts covers marking. */
const openLook = async (page: import("./fixtures.ts").Page) => {
  await expect(page.getByTestId("waiting-list").locator(".qrow").first()).toBeVisible(); // the Board has loaded
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByPlaceholder("Type a command or search Cards…")).toBeFocused();
  await page.keyboard.type("Theme switch in settings");
  await page.keyboard.press("Enter");
};

test("waiting on me lists blockers closest to Done first, then To look at", async ({ page }) => {
  await page.goto("/");
  const rows = page.getByTestId("waiting-list").locator(".qrow");
  await expect(rows.first()).toContainText("Due date picker");
  await expect(page.getByText("To look at")).toBeVisible();
  await expect(page.getByTestId("waiting")).toContainText("Theme switch in settings");
});

test("answer a decision request in place and Push", async ({ page }) => {
  await page.goto("/");
  const panel = page.getByTestId("panel-decision");
  // a failed answer on #117 is that Card's draft only: #105 has a request with the same id (D1) and starts empty
  await page.locator('[data-card="acme/app#117"]').click();
  await panel.getByRole("button", { name: /B: 200 MB/ }).click();
  await panel.locator("textarea").fill("with a note");
  await page.route("**/api/cards/acme/app/117/answer", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) }));
  await panel.getByRole("button", { name: "Answer" }).click();
  await expect(page.getByTestId("toast").filter({ hasText: "Failed: boom" })).toBeVisible();
  await page.locator('[data-card="acme/app#105"]').click();
  await expect(panel).toContainText("How should conflicting edits be resolved?");
  await expect(panel.locator("textarea")).toHaveValue("");
  await expect(panel.locator(".option.selected")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Answer" })).toBeDisabled();
  await panel.getByRole("button", { name: /B: field-level merge/ }).click();
  await panel.getByRole("button", { name: "Answer" }).click();
  await expect(page.getByTestId("toast").filter({ hasText: "pushed to the coordinator" })).toBeVisible();
  // the answered Card moves to Awaiting pickup and the next blocker opens
  await expect(page.getByTestId("detail")).not.toHaveAttribute("aria-label", "Card acme/app#105");
  await page.locator('[data-card="acme/app#105"]').click();
  await expect(page.getByTestId("awaiting-pickup")).toBeVisible();
});

test("gallery by keyboard only: variants, viewport, pick, send", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-card="acme/app#110"]').click();
  const panel = page.getByTestId("panel-design-round");
  const gallery = page.getByTestId("gallery");
  const title = page.getByTestId("gallery-title");
  // the palette opens the waiting round; its request must not fire again once the round is answered (below)
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("Open screenshots");
  await page.keyboard.press("Enter");
  await expect(gallery).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(gallery).toBeHidden();
  await panel.locator(".thumb").first().focus();
  await page.keyboard.press("Enter");
  await expect(gallery).toBeFocused();
  await expect(gallery).toContainText("R2");
  // across variants: 2 = second variant, ] next, [ previous; the viewport survives the jump
  await page.keyboard.press("v");
  await expect(gallery.getByRole("button", { name: "mobile" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("2");
  await expect(title).toHaveText("Variant b · Split pane");
  await expect(gallery.getByRole("button", { name: "mobile" })).toHaveAttribute("aria-pressed", "true");
  await expect(gallery).toContainText("4 / 6");
  await page.keyboard.press("]");
  await expect(title).toHaveText("Variant c · Cards grid");
  await page.keyboard.press("]");
  await expect(title).toHaveText("Variant c · Cards grid"); // last variant: stays
  await page.keyboard.press("[");
  await page.keyboard.press("v");
  await expect(gallery.getByRole("button", { name: "desktop" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("9"); // no ninth variant: ignored
  await expect(title).toHaveText("Variant b · Split pane");
  // keys the gallery does not use never reach the board behind it
  // (the triage keys too: none of them writes a label or Pushes while the gallery is open)
  for (const key of ["j", "k", "ArrowDown", "c", "o", "ControlOrMeta+k", "d", "s", "b", "a", "w", "0"]) await page.keyboard.press(key);
  await expect(gallery).toBeVisible();
  await expect(page.getByTestId("toast")).toHaveCount(0);
  await expect(title).toHaveText("Variant b · Split pane");
  await expect(page.getByRole("dialog", { name: "Capture an idea" })).toBeHidden();
  await expect(page.getByPlaceholder("Type a command or search Cards…")).toBeHidden();
  await expect(page.getByTestId("detail")).toHaveAttribute("aria-label", "Card acme/app#110");
  // pick the shown variant, close, focus is back on the thumbnail that opened the gallery
  await page.keyboard.press("p");
  await expect(gallery).toContainText("picked");
  await page.keyboard.press("x");
  await expect(gallery).toContainText("rejected");
  await page.keyboard.press("x");
  await page.keyboard.press("Escape");
  await expect(gallery).toBeHidden();
  await expect(panel.locator(".thumb").first()).toBeFocused();
  await expect(panel.getByRole("button", { name: "Pick" }).nth(1)).toHaveClass(/selected/);
  // reopen and send with ⌘↵ from inside the gallery
  await page.keyboard.press("Enter");
  await expect(gallery).toBeFocused(); // its keys are the popup's: they need the focus in it
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(gallery).toBeHidden();
  await expect(page.getByTestId("toast").filter({ hasText: "Feedback given" })).toBeVisible();
  // the answered round moves to "earlier": the old palette request does not open a gallery there
  await page.locator('[data-card="acme/app#110"]').click();
  await page.keyboard.press("]");
  await expect(page.getByTestId("earlier-rounds")).toBeVisible();
  await expect(gallery).toBeHidden();
});

test("earlier rounds are read-only in the same gallery", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-card="acme/app#104"]').click();
  await page.keyboard.press("]"); // the Decided tab lists the earlier rounds
  await expect(page.getByTestId("earlier-rounds")).toBeVisible();
  await expect(page.getByTestId("round-1")).toContainText("R1");
  await page.getByTestId("round-1").locator(".thumb").first().click();
  const gallery = page.getByTestId("gallery");
  await expect(gallery).toContainText("R1 · read-only");
  await expect(gallery).toBeFocused(); // the keys are the popup's: they need the focus in it
  await expect(gallery).not.toContainText("p pick");
  await page.keyboard.press("p");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(gallery).toBeVisible(); // nothing to send, nothing picked
  await expect(gallery).not.toContainText("picked");
  await page.keyboard.press("2");
  await expect(page.getByTestId("gallery-title")).toHaveText("Variant b · Split pane");
  await page.keyboard.press("Escape");
});

test("palette opens the Card's screenshots", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-card="acme/app#104"]').click();
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("Open screenshots");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("gallery")).toContainText("R2");
  await page.keyboard.press("Escape");
});

test("a Look opens in the same gallery, grouped by state, read-only", async ({ page }) => {
  await page.goto("/");
  await openLook(page);
  const look = page.getByTestId("panel-look");
  await expect(look.getByTestId("thumb-group-default")).toBeVisible();
  await expect(look.getByTestId("thumb-group-empty")).toBeVisible();
  await look.locator(".thumb").first().click();
  const gallery = page.getByTestId("gallery");
  await expect(gallery).toContainText("Look · read-only");
  await expect(gallery).toBeFocused(); // the keys are the popup's: they need the focus in it
  await expect(page.getByTestId("gallery-title")).toHaveText("default");
  await page.keyboard.press("]");
  await expect(page.getByTestId("gallery-title")).toHaveText("empty");
  await page.keyboard.press("p");
  await expect(gallery).not.toContainText("picked");
  await page.keyboard.press("Escape");
});

test("a screenshot that does not load shows where to find it", async ({ page }) => {
  await page.goto("/");
  const looked = page.waitForResponse((r) => r.url().includes("/108/images"));
  await openLook(page);
  await looked;
  // an image error twice (the refetch brings nothing new on demo data) shows the way to the comment
  await page.evaluate(() => document.querySelectorAll<HTMLImageElement>('[data-testid="panel-look"] img').forEach((i) => i.dispatchEvent(new Event("error"))));
  await expect(page.getByTestId("panel-look").getByTestId("shot-missing").first()).toContainText("Screenshot did not load");
  await expect(page.getByTestId("panel-look").getByRole("link", { name: /Open comment on GitHub/ }).first()).toBeVisible();
});

test("react to a design round with the keyboard gallery", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-card="acme/app#104"]').click();
  const panel = page.getByTestId("panel-design-round");
  await panel.locator(".thumb").first().click();
  const gallery = page.getByTestId("gallery");
  await expect(gallery).toContainText("1 / 6");
  await expect(gallery).toBeFocused(); // its keys are the popup's: they need the focus in it
  await expect(page.getByTestId("gallery-title")).toHaveText("Variant a · Grouped list");
  await page.keyboard.press("ArrowRight");
  await expect(gallery).toContainText("2 / 6");
  await expect(gallery.getByRole("button", { name: "mobile" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(gallery).toBeHidden();
  await panel.getByRole("button", { name: "Pick" }).nth(1).click();
  await panel.getByRole("button", { name: "Send reaction" }).click();
  await expect(page.getByTestId("toast").filter({ hasText: "Feedback given" })).toBeVisible();
});

test("board shows the five Phases and capture lands in the Inbox", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Board", exact: true }).click();
  for (const p of ["Inbox", "Backlog", "UX Design", "Build", "Done"]) await expect(page.getByTestId(`column-${p}`)).toBeVisible();
  await expect(page.getByTestId("board")).toBeVisible();
  await page.keyboard.press("c");
  await page.getByPlaceholder("Title").fill("Idea from E2E");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("column-Inbox")).toContainText("Idea from E2E");
});

test("command palette jumps to a Card", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("waiting")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByPlaceholder("Type a command or search Cards…")).toBeFocused();
  await page.keyboard.type("Tag colors");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("detail")).toHaveAttribute("aria-label", "Card acme/app#107");
});

test("the Look panel has no Mark Seen button: Seen is marked from the list, the keys and the palette (seen.spec.ts)", async ({ page }) => {
  await page.goto("/");
  await openLook(page);
  const look = page.getByTestId("panel-look");
  await expect(look).toContainText("The switch follows the system theme");
  await expect(look.getByRole("button", { name: /Mark (Seen|unseen)/ })).toHaveCount(0);
});

test("each main nav entry has a decorative leading icon and keeps its accessible name (#38)", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Views" });
  for (const name of [/^Waiting on me/, "Board", "Wayfinder maps", "Settings"]) {
    const item = nav.getByRole("button", { name });
    await expect(item.locator('svg.nav-icon[aria-hidden="true"]')).toBeVisible();
    // the icon is the first thing in the row, before the label
    expect(await item.evaluate((el) => el.firstElementChild?.tagName.toLowerCase())).toBe("svg");
  }
  // four different shapes
  const shapes = await nav.locator("svg.nav-icon").evaluateAll((els) => els.map((e) => e.innerHTML));
  expect(new Set(shapes).size).toBe(4);
  expect(shapes).toHaveLength(4);
});
