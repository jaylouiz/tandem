import { expect, test, type Page } from "./fixtures.ts";

// Controls explain themselves (#46): disabled reasons, key tooltips, pressed state, the sync error detail by keyboard, sticky heads,
// reduced motion, the Waiting on me count. Read-only on the fixture data (the Cards 117, 110 and 173 are opened, never changed).
const toBoard = async (page: Page) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Board", exact: true }).click();
};
const card = (page: Page, n: number) => page.locator(`[data-card="acme/app#${n}"]`);

test("a disabled control carries its reason as title and aria-describedby, stays focusable, and does nothing", async ({ page }) => {
  await toBoard(page);
  await card(page, 117).click(); // a Build Card: Next step does not apply
  const next = page.getByTestId("triage").getByRole("button", { name: /design/ });
  await expect(next).toHaveAttribute("aria-disabled", "true");
  await expect(next).toHaveAttribute("title", "Not applicable: Build");
  const id = await next.getAttribute("aria-describedby");
  await expect(page.locator(`[id="${id}"]`)).toHaveText("Not applicable: Build");
  await next.focus();
  await expect(next).toBeFocused(); // a `disabled` button would have dropped focus: the reason stays reachable by keyboard
  await page.keyboard.press("Enter");
  await expect(page.locator(".toast")).toHaveCount(0); // and nothing ran
  // the Feedback panel's Answer says what is missing, then loses it
  const answer = page.getByTestId("panel-decision").getByRole("button", { name: "Answer" });
  await expect(answer).toHaveAttribute("title", "Pick an option or write an answer");
  await page.getByTestId("panel-decision").getByRole("button", { name: /A: 50 MB/ }).click();
  await expect(answer).not.toHaveAttribute("aria-disabled", "true");
  await expect(answer).not.toHaveAttribute("aria-describedby", /.+/);
});

test("the two holds read differently on one pane: Hold merge (PR) and Hold Card (label)", async ({ page }) => {
  await toBoard(page);
  await card(page, 173).click();
  const pane = page.getByTestId("detail");
  await expect(pane.getByTestId("panel-pr-approval").getByRole("button", { name: /Hold merge/ })).toBeVisible();
  await expect(pane.getByTestId("triage").getByRole("button", { name: /Hold Card/ })).toBeVisible();
});

test("an icon-only button shows its key in a tooltip, on hover and on keyboard focus; Esc closes the tooltip only", async ({ page }) => {
  await toBoard(page);
  await card(page, 117).click();
  const close = page.getByTestId("detail").getByRole("button", { name: "Close", exact: true });
  await close.hover();
  await expect(page.getByTestId("tooltip")).toHaveText(/Close the Card\s*esc/);
  await page.mouse.move(600, 600);
  await expect(page.getByTestId("tooltip")).toHaveCount(0);
  await expect(close).toHaveAttribute("aria-keyshortcuts", "Escape");
  // keyboard: Tab onto the button (focus-visible) shows it too
  await card(page, 117).focus();
  for (let i = 0; i < 40 && !(await close.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await expect(page.getByTestId("tooltip")).toHaveText(/esc/);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("tooltip")).toHaveCount(0);
  await expect(page.getByTestId("detail")).toBeVisible(); // the first Esc closed the tooltip, not the Card
});

test("a row's Mark Seen button names no key: `l` marks the selection, not the hovered row", async ({ page }) => {
  await page.goto("/");
  const btn = page.locator('[data-card="acme/app#108"]').locator("xpath=..").getByRole("button", { name: "Mark Seen" }); // hover only: the Look stays unseen
  await btn.hover();
  await expect(page.getByTestId("tooltip")).toHaveText("Mark Seen");
  await expect(btn).not.toHaveAttribute("aria-keyshortcuts", /.+/);
});

test("the Gallery's arrows show their keys and say why they are off at the ends", async ({ page }) => {
  await page.goto("/");
  await card(page, 110).click();
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("Open screenshots");
  await page.keyboard.press("Enter");
  const gallery = page.getByTestId("gallery");
  await expect(gallery).toBeVisible();
  const prev = gallery.getByRole("button", { name: "Previous screenshot" });
  const next = gallery.getByRole("button", { name: "Next screenshot" });
  await expect(prev).toHaveAttribute("aria-disabled", "true");
  await expect(prev).toHaveAttribute("title", "This is the first screenshot");
  await next.hover();
  await expect(page.getByTestId("tooltip")).toHaveText(/Next screenshot\s*→/);
  await next.click();
  await expect(prev).not.toHaveAttribute("aria-disabled", "true");
});

test("the sync error detail opens by keyboard and Esc closes it", async ({ page }) => {
  const board = await (await page.request.get("/api/board")).json();
  board.sync = { ...board.sync, "acme/app": { at: null, syncing: false, error: "GitHub answered 502" } };
  await page.route("**/api/events", (r) => r.fulfill({ status: 200, contentType: "text/event-stream", body: `event: board\nid: 1\ndata: ${JSON.stringify(board)}\n\n` }));
  await page.goto("/");
  const chip = page.getByTestId("sync-error");
  await expect(chip).toHaveText("Sync error · 1");
  await chip.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("sync-error-detail")).toContainText("acme/app");
  await expect(page.getByTestId("sync-error-detail")).toContainText("GitHub answered 502");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("sync-error-detail")).toHaveCount(0);
  await expect(chip).toBeFocused();
});

test("buttons have a pressed state, one step below hover", async ({ page }) => {
  await toBoard(page);
  await card(page, 117).click();
  const build = page.getByTestId("triage").getByRole("button", { name: /^P2/ });
  const bg = () => build.evaluate((el) => getComputedStyle(el).backgroundColor);
  await build.hover();
  await page.waitForTimeout(200);
  const hover = await bg();
  await page.mouse.down();
  await page.waitForTimeout(200);
  const pressed = await bg();
  expect(pressed).not.toBe(hover);
  await page.mouse.move(600, 700); // let go elsewhere: no click, nothing is written
  await page.mouse.up();
});

test("column heads stick while the column scrolls, and the Done day heads stick under them", async ({ page }) => {
  await toBoard(page);
  const scroll = page.locator(".scroll");
  await scroll.evaluate((el) => (el.scrollTop = 800));
  const top = await scroll.evaluate((el) => el.getBoundingClientRect().top);
  const heads = page.locator(".board .column-head");
  for (let i = 0; i < 5; i++) expect(await heads.nth(i).evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(Math.round(top));
  const done = page.locator('[data-column="Done"] .done-head').first();
  const headH = await heads.first().evaluate((el) => el.getBoundingClientRect().height);
  expect(await done.evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(Math.round(top + headH));
});

test("Waiting on me group heads stick while the rows scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 420 });
  await page.goto("/");
  const list = page.locator(".split-list");
  await expect(list).toBeVisible();
  await list.evaluate((el) => (el.scrollTop = 200));
  const top = await list.evaluate((el) => el.getBoundingClientRect().top);
  expect(await page.locator(".split-list .group-head").first().evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(Math.round(top));
});

test("reduced motion: the Selection bar and the chevrons do not animate", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await toBoard(page);
  await card(page, 117).click();
  await page.keyboard.press("x");
  const bar = page.getByTestId("markbar");
  await expect(bar).toBeVisible();
  expect(await bar.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  expect(await page.locator(".chev").first().evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
  await page.keyboard.press("Escape");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await card(page, 117).click();
  await page.keyboard.press("x");
  expect(await bar.evaluate((el) => getComputedStyle(el).animationName)).toBe("rise");
});

test("the sidebar and Repo counts are the Waiting on me rows: To look at is not counted (D1)", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".qrow")).not.toHaveCount(0);
  const blockers = await page.locator('.qrow:not([data-kind="look"]):not([data-kind="pickup"])').count();
  const looks = await page.locator('.qrow[data-kind="look"]').count();
  expect(looks).toBeGreaterThan(0);
  await expect(page.getByTestId("count-waiting")).toHaveText(String(blockers));
  await expect(page.locator(".repo-list .nav-item", { hasText: "app" }).locator(".count")).toHaveText(String(blockers));
});
