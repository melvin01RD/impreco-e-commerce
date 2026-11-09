import { defineConfig } from "@playwright/test";
import { randomUUID, randomBytes, randomInt } from "node:crypto";
import dev from "./playwright.config";

process.env.FISCAL_E2E_RUN_ID ||= randomUUID().replaceAll("-", "");
process.env.FISCAL_E2E_PASSWORD ||= randomBytes(24).toString("hex");
process.env.FISCAL_E2E_SEQUENCE ||= String(randomInt(1, 9999999998));

export default defineConfig({
  ...dev,
  testDir: "./e2e/fiscal",
  globalSetup: "./e2e/fiscal/setup.ts",
  // Only synthetic accounts authenticate in these tests. Avoid retaining
  // signed storage URLs or unrelated shared-DEV data in browser traces.
  use: { ...dev.use, trace: "off" },
});
