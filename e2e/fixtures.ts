// Every spec imports `test` and `expect` from here, never from "@playwright/test" (npm run check:e2e-reset).
// The server holds the demo data in memory and all specs share it, so each test starts by putting it back to boot state:
// a test may move, answer or mark any fixture Card without breaking the tests that run after it.
import { test as base, type Page } from "@playwright/test";

export * from "@playwright/test";

/** The header the server requires on every write (src/server/guard.ts); the web client sends it too. */
export const WRITE = { "x-tandem": "1" };

export const test = base.extend<{ freshFixture: void }>({
  freshFixture: [
    async ({ request }, use) => {
      const res = await request.post("/api/fixture/reset", { data: {}, headers: WRITE });
      if (!res.ok()) throw new Error(`fixture reset failed: ${res.status()} ${await res.text()}`);
      await use();
    },
    { auto: true },
  ],
});

/** Open a fold of the Card sheet (Issue, Decided, Activity) when it is closed: a click on its head, like a developer would. */
export async function openFold(page: Page, id: "issue" | "decided" | "activity") {
  const head = page.getByTestId("detail").getByTestId(`fold-${id}`).locator(".fold-head");
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click();
}

/**
 * The toast whose text contains `text`, case-sensitive. A plain `filter({ hasText: "Marked Seen" })` is a case-insensitive substring match, so it also
 * matches a failure toast "Not marked Seen: boom" that is still up (failures stay): two elements, a strict-mode violation that came and went with timing (#11).
 */
export const toast = (page: Page, text: string | RegExp) => page.getByTestId("toast").filter({ hasText: typeof text === "string" ? new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) : text });
