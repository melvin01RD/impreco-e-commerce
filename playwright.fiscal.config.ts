import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/fiscal", fullyParallel: false, workers: 1,
  timeout: 120000,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: { baseURL: "http://localhost:3197", trace: "retain-on-failure" },
  webServer: {
    command: "node scripts/fiscal-qa-server.mjs dev",
    url: "http://localhost:3197/api/admin/fiscal/capabilities",
    timeout: 240000, reuseExistingServer: false,
  },
});
