import { expect, test, type Page } from "./fixtures.ts";

// Writes outside a Card (#44): Settings, Capture and Refresh keep the change only if the write succeeded, and say what failed.
// Every PUT/POST here is mocked, so the fixture server is never changed.
const fail = (page: Page, url: string, error = "boom") => page.route(url, (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error }) }));
const ok = (page: Page, url: string, body: unknown = { ok: true }) => page.route(url, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }));
const toSettings = async (page: Page) => {
  await page.goto("/");
  await expect(page.getByTestId("waiting-list").locator(".qrow").first()).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByTestId("settings")).toBeVisible();
};
const boxes = (page: Page) => page.getByTestId("settings").getByRole("checkbox");

test("a failed repo toggle rolls back and names the repo", async ({ page }) => {
  await toSettings(page);
  await fail(page, "**/api/repos");
  const box = page.getByRole("checkbox", { name: "acme/app" });
  await expect(box).toBeChecked();
  await box.click();
  await expect(page.getByTestId("toast").filter({ hasText: "Could not remove acme/app from the Board: boom" })).toBeVisible();
  await expect(box).toBeChecked();
});

test("a toggled repo keeps its place in the list", async ({ page }) => {
  await toSettings(page);
  await ok(page, "**/api/repos");
  const names = async () => boxes(page).evaluateAll((els) => els.map((e) => e.closest("label")!.textContent!.trim()));
  const before = await names();
  expect(before.length).toBeGreaterThan(1);
  await boxes(page).first().click();
  await expect(boxes(page).first()).not.toBeChecked();
  expect(await names()).toEqual(before);
});

test("a failed local path goes back to the saved one and says so", async ({ page }) => {
  await toSettings(page);
  await ok(page, "**/api/repos/path");
  const input = page.getByRole("textbox", { name: "Local path for acme/app" });
  await input.fill("/tmp/saved-path");
  await input.blur();
  await expect(input).toHaveValue("/tmp/saved-path");
  await page.unroute("**/api/repos/path");
  await fail(page, "**/api/repos/path");
  await input.fill("/tmp/other-path");
  await input.blur();
  await expect(page.getByTestId("toast").filter({ hasText: "Could not save the local path for acme/app: boom" })).toBeVisible();
  await expect(input).toHaveValue("/tmp/saved-path");
});

test("a failed Capture keeps the dialog and its text, shows the error inline, and sends again", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("waiting-list").locator(".qrow").first()).toBeVisible();
  await fail(page, "**/api/issues", "GitHub said no");
  await page.keyboard.press("c");
  const dialog = page.getByRole("dialog", { name: "Capture an idea" });
  await dialog.getByPlaceholder("Title").fill("An idea that must survive");
  await dialog.getByPlaceholder("Details (optional)").fill("with details");
  await dialog.getByRole("button", { name: "Capture" }).click();
  await expect(dialog.getByTestId("capture-error")).toContainText("Not captured: GitHub said no");
  await expect(dialog.getByPlaceholder("Title")).toHaveValue("An idea that must survive");
  await expect(dialog.getByPlaceholder("Title")).toBeFocused(); // Esc and ⌘↵ keep working after a failure
  await expect(dialog.getByPlaceholder("Details (optional)")).toHaveValue("with details");
  // the same text goes out again; the next success closes the dialog
  await page.unroute("**/api/issues");
  await ok(page, "**/api/issues", { number: 4404 });
  await dialog.getByRole("button", { name: "Capture" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("toast").filter({ hasText: "Captured acme/agent-workflow#4404 in the Inbox" })).toBeVisible();
});

test("Refresh from GitHub shows progress, then how it ended", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("waiting-list").locator(".qrow").first()).toBeVisible();
  const run = async () => {
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByPlaceholder("Type a command or search Cards…")).toBeFocused();
    await page.keyboard.type("Refresh from");
    await page.keyboard.press("Enter");
  };
  await page.route("**/api/refresh", async (r) => {
    await new Promise((res) => setTimeout(res, 300));
    await r.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "acme/app: rate limited" }) });
  });
  await run();
  await expect(page.getByTestId("toast").filter({ hasText: "Refreshing from GitHub…" })).toBeVisible();
  await expect(page.getByTestId("toast").filter({ hasText: "Could not refresh from GitHub: acme/app: rate limited" })).toBeVisible();
  await page.unroute("**/api/refresh");
  await run();
  await expect(page.getByTestId("toast").filter({ hasText: "Refreshed from GitHub" })).toBeVisible();
});

test("a Capture closed while it was on its way still says that it failed, and the text is there on the next Capture", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("waiting-list").locator(".qrow").first()).toBeVisible();
  await page.route("**/api/issues", async (r) => {
    await new Promise((res) => setTimeout(res, 300));
    await r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "GitHub said no" }) });
  });
  await page.keyboard.press("c");
  const dialog = page.getByRole("dialog", { name: "Capture an idea" });
  await dialog.getByPlaceholder("Title").fill("Closed too early");
  await dialog.getByRole("button", { name: "Capture" }).click();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("toast").filter({ hasText: "Could not capture the idea in acme/agent-workflow: GitHub said no" })).toBeVisible();
  await page.keyboard.press("c");
  await expect(dialog.getByPlaceholder("Title")).toHaveValue("Closed too early");
  await expect(dialog.getByTestId("capture-error")).toHaveCount(0); // no banner from the last time
});

test("a toggle that failed does not ride along with the next one", async ({ page }) => {
  await toSettings(page);
  const bodies: string[][] = [];
  let n = 0;
  await page.route("**/api/repos", async (r) => {
    if (r.request().method() !== "PUT") return r.continue();
    bodies.push((r.request().postDataJSON() as { repos: string[] }).repos);
    if (n++ === 0) {
      await new Promise((res) => setTimeout(res, 300));
      return r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) });
    }
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await boxes(page).first().click(); // agent-workflow off: fails
  await boxes(page).last().click(); // app off while the first is still on its way
  await expect(page.getByTestId("toast").filter({ hasText: "Could not remove acme/agent-workflow from the Board: boom" })).toBeVisible();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[0]).toEqual(["acme/app"]);
  expect(bodies[1]).toEqual(["acme/agent-workflow"]); // the server never saw the failed toggle's removal
  await expect(boxes(page).first()).toBeChecked();
  await expect(boxes(page).last()).not.toBeChecked();
});

test("Ctrl+Enter in the title sends the idea once", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("waiting-list").locator(".qrow").first()).toBeVisible();
  let posts = 0;
  await page.route("**/api/issues", async (r) => {
    posts++;
    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ number: 4405 }) });
  });
  await page.keyboard.press("c");
  const dialog = page.getByRole("dialog", { name: "Capture an idea" });
  await dialog.getByPlaceholder("Title").fill("Once only");
  await page.keyboard.press("Control+Enter");
  await expect(dialog).toBeHidden();
  await page.waitForTimeout(200);
  expect(posts).toBe(1);
});
