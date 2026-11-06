import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

// E2E runs the built app on demo data (TANDEM_SOURCE=fixture) with a fake Push.
// Fixture mode is in-memory; the fresh TANDEM_HOME is a second guard so nothing can reach the real ~/.tandem.
const port = Number(process.env.E2E_PORT ?? 4399);
const home = mkdtempSync(join(tmpdir(), "tandem-e2e-"));

export default defineConfig({
  testDir: "e2e",
  outputDir: process.env.E2E_OUT ?? "test-results",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}`, viewport: { width: 1440, height: 900 } },
  webServer: {
    command: `TANDEM_HOME=${home} WF_ISSUE_LOG_DIR=${process.cwd()}/e2e/logs TANDEM_SOURCE=fixture TANDEM_PORT=${port} node dist/server/server/main.js`,
    url: `http://127.0.0.1:${port}/api/board`,
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
