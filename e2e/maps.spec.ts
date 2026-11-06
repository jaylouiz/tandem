import { expect, test, type Locator, type Page } from "./fixtures.ts";

/** `g <key>` before the app has attached its key handler is lost: repeat until the view shows. */
const goTo = (page: Page, key: string, shown: Locator) =>
  expect(async () => {
    await page.keyboard.press("g");
    await page.keyboard.press(key);
    await expect(shown).toBeVisible({ timeout: 400 });
  }).toPass();

// The demo map is acme/app#109 (src/core/fixtures.ts): 1 frontier, 1 claimed, 1 blocked, 4 decided/dropped.

test("maps view groups the decision tickets of a map", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Views" }).getByRole("button", { name: "Wayfinder maps" }).click();
  const map = page.getByTestId("map-109");
  await expect(map.getByTestId("map-summary")).toHaveText("1 frontier · 1 claimed · 1 blocked · 4 decided");
  await expect(map.getByTestId("group-Frontier")).toContainText("Which sync library fits?");
  await expect(map.getByTestId("ticket-121")).toHaveAttribute("data-status", "frontier");
  await expect(map.getByTestId("group-Claimed")).toContainText("demo-user");
  await expect(map.getByTestId("ticket-123")).toContainText("Blocked by #121 Which sync library fits?; #122 Conflict rules offline");
  await expect(map.getByTestId("ticket-123")).not.toContainText("Cache scope"); // its closed blocker
  await expect(map.getByTestId("ticket-120")).toContainText("cache the last 200 tasks");
  await expect(map.getByTestId("ticket-124")).toContainText("Not in the map's index yet");
  await expect(map.getByTestId("ticket-126")).toContainText("Not planned");
});

test("the map body is a collapsed disclosure and tickets are keyboard-reachable links", async ({ page }) => {
  await page.goto("/");
  const map = page.getByTestId("map-109");
  await goTo(page, "m", map);
  await expect(map.getByText("A spec for working offline")).toBeHidden();
  await map.getByText("Map", { exact: true }).click();
  await expect(map.getByText("A spec for working offline")).toBeVisible();
  const ticket = map.getByTestId("ticket-121");
  await expect(ticket).toHaveAttribute("href", /\/issues\/121$/);
  await ticket.focus();
  await expect(ticket).toBeFocused();
});

test("wayfinder maps and tickets never appear on the Board", async ({ page }) => {
  await page.goto("/");
  await goTo(page, "b", page.getByTestId("board"));
  await expect(page.getByTestId("board")).not.toContainText("Wayfinder: offline mode");
  await expect(page.getByTestId("board")).not.toContainText("Which sync library fits?");
  await expect(page.locator('[data-card="acme/app#121"]')).toHaveCount(0);
});

test("a Card picked in the palette opens its pane in the Maps view too", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Views" }).getByRole("button", { name: "Wayfinder maps" }).click();
  await expect(page.getByTestId("map-109")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("app#117");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("detail")).toHaveAttribute("aria-label", "Card acme/app#117");
  await expect(page.getByTestId("map-109")).toBeVisible(); // still in Maps
});
