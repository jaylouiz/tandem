// Every spec imports `test` and `expect` from here, never from "@playwright/test" (npm run check:e2e-reset).
// The server holds the demo data in memory and all specs share it, so each test starts by putting it back to boot state:
// a test may move, answer or mark any fixture Card without breaking the tests that run after it.
import { test as base } from "@playwright/test";

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
