import { expect, test, type Page } from "./fixtures.ts";

// Settings holds the theme and notifications next to the repos (#6); the palette keeps its theme commands.
const open = async (page: Page) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByTestId("settings")).toBeVisible();
};
const theme = (page: Page, name: string) => page.getByTestId("settings-theme").getByRole("radio", { name });

test("the theme choice applies at once, is remembered, and follows the palette's commands", async ({ page }) => {
  await open(page);
  await expect(theme(page, "System")).toBeChecked();
  await theme(page, "Dark").check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("tandem.theme"))).toBe("dark");
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("Theme: light");
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(theme(page, "Light")).toBeChecked();
  await theme(page, "System").check();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("tandem.theme"))).toBeNull();
});

test("the theme radios are reachable by keyboard", async ({ page }) => {
  await open(page);
  await theme(page, "System").focus();
  await page.keyboard.press("ArrowDown");
  await expect(theme(page, "Light")).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

const permission = (page: Page, value: string, asked = "denied") =>
  page.addInitScript(
    ([v, a]) => {
      Object.defineProperty(Notification, "permission", { get: () => v, configurable: true });
      Notification.requestPermission = () => Promise.resolve(a as NotificationPermission);
    },
    [value, asked],
  );

test("Notifications says whether they are on", async ({ page }) => {
  await permission(page, "granted");
  await open(page);
  await expect(page.getByTestId("notifications-state")).toHaveText("On");
  await expect(page.getByTestId("settings-notifications").getByRole("button", { name: "Enable notifications" })).toHaveCount(0);
});

test("Notifications offers Enable while it is not granted, and says when the browser blocks it", async ({ page }) => {
  await permission(page, "default");
  await open(page);
  await expect(page.getByTestId("notifications-state")).toHaveText("Off");
  await page.getByTestId("settings-notifications").getByRole("button", { name: "Enable notifications" }).click();
  await expect(page.getByTestId("notifications-state")).toHaveText(/blocked/);
});
