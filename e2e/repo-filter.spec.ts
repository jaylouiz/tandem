import { expect, test, type Page } from "./fixtures.ts";

// The Repo filter (#47) is read-only on the fixture server: it changes no Card.
const repos = (page: Page) => page.getByRole("group", { name: "Repos" });
const chip = (page: Page) => page.getByTestId("repo-filter-chip");
const list = (page: Page) => page.getByTestId("waiting-list");

test("an active filter shows as a chip with ×; the sidebar count reads 'of', and × clears it", async ({ page }) => {
  await page.goto("/");
  await expect(list(page).locator(".qrow").first()).toBeVisible();
  await expect(chip(page)).toHaveCount(0);
  await expect(page.getByTestId("count-waiting")).not.toContainText("of");
  await repos(page).getByRole("button", { name: /^agent-workflow/ }).click();
  await expect(chip(page)).toContainText("agent-workflow");
  await expect(page.getByTestId("count-waiting")).toContainText(/^0\s*of \d+$/);
  await expect(page.getByTestId("filtered-empty")).toContainText("Nothing waits on you in agent-workflow.");
  await expect(page.getByTestId("filtered-empty")).toContainText("hidden by the Repo filter");
  await chip(page).getByRole("button", { name: /Clear the Repo filter/ }).click();
  await expect(chip(page)).toHaveCount(0);
  await expect(page.getByTestId("count-waiting")).not.toContainText("of");
  await expect(list(page).locator(".qrow").first()).toBeVisible();
});

test("the empty list under a filter has its own way back", async ({ page }) => {
  await page.goto("/");
  await repos(page).getByRole("button", { name: /^agent-workflow/ }).click();
  await page.getByTestId("filtered-empty").getByRole("button", { name: "Show all repos" }).click();
  await expect(chip(page)).toHaveCount(0);
  await expect(list(page).locator(".qrow").first()).toBeVisible();
});

test("Esc steps outward: the open Card first, then the filter; the palette clears it too", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await repos(page).getByRole("button", { name: /^app/ }).click();
  await expect(chip(page)).toContainText("app");
  await page.locator(".card").first().click();
  await expect(page.getByTestId("detail")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("detail")).toHaveCount(0);
  await expect(chip(page)).toBeVisible(); // the first Esc only closed the Card
  await page.keyboard.press("Escape");
  await expect(chip(page)).toHaveCount(0);
  await repos(page).getByRole("button", { name: /^app/ }).click();
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("clear repo filter");
  await expect(page.getByRole("option", { name: /Clear the Repo filter/ })).toContainText("esc");
  await page.keyboard.press("Enter");
  await expect(chip(page)).toHaveCount(0);
});

test("Esc in Waiting on me: the list takes focus first (the Card stays open), the next Esc clears the filter", async ({ page }) => {
  await page.goto("/");
  await repos(page).getByRole("button", { name: /^app/ }).click();
  await list(page).locator(".qrow").first().click();
  await expect(page.getByTestId("detail")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(list(page)).toBeFocused();
  await expect(page.getByTestId("detail")).toBeVisible();
  await expect(chip(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(chip(page)).toHaveCount(0);
});

test("Esc with no Card open clears the filter at once, and the chip stays visible in Settings", async ({ page }) => {
  await page.goto("/");
  await repos(page).getByRole("button", { name: /^app/ }).click();
  await expect(chip(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(chip(page)).toHaveCount(0);
  await repos(page).getByRole("button", { name: /^app/ }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(chip(page)).toBeVisible(); // Esc clears it there, so it is never an invisible filter
  await page.keyboard.press("Escape");
  await expect(chip(page)).toHaveCount(0);
});

test("a filter that hides the open Card closes it explicitly", async ({ page }) => {
  await page.goto("/");
  const first = list(page).locator(".qrow").first();
  await expect(first).toBeVisible();
  const card = (await first.getAttribute("data-card"))!;
  const [repo] = card.split("#");
  const other = repo!.endsWith("app") ? /^agent-workflow/ : /^app/;
  await first.click();
  await expect(page.getByTestId("detail")).toHaveAttribute("aria-label", `Card ${card}`);
  await repos(page).getByRole("button", { name: other }).click();
  await expect(page.getByTestId("detail")).toHaveCount(0);
  await expect(page.getByTestId("waiting")).toContainText("Select a Card");
  await chip(page).getByRole("button").click();
  await expect(page.getByTestId("detail")).toHaveCount(0); // clearing the filter does not bring a closed Card back
});

test("the filter survives a reload", async ({ page }) => {
  await page.goto("/");
  await repos(page).getByRole("button", { name: /^app/ }).click();
  await expect(chip(page)).toContainText("app");
  await page.reload();
  await expect(chip(page)).toContainText("app");
  await expect(repos(page).getByRole("button", { name: /^app/ })).toHaveAttribute("aria-pressed", "true");
  await chip(page).getByRole("button").click();
  await page.reload();
  await expect(page.getByTestId("waiting")).toBeVisible();
  await expect(chip(page)).toHaveCount(0);
});
