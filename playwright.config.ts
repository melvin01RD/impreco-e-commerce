import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/dev",
  globalSetup: "./e2e/dev/setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  webServer: {
    command: "node scripts/check-mongodb.mjs && node node_modules/next/dist/bin/next dev --webpack --port 3000",
    url: "http://localhost:3000/api/admin/fiscal/capabilities",
    timeout: 240000,
    reuseExistingServer: !process.env.CI,
  },
});
