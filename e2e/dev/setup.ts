import { execFileSync } from "node:child_process";

export default function setup() {
  // Also validate when Playwright reuses an already running DEV server.
  execFileSync(process.execPath, ["scripts/check-mongodb.mjs"], { stdio: "inherit", timeout: 30000 });
}
