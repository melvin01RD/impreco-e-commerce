import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const integration = process.argv.includes("--integration");
if (integration) {
  const check = spawnSync(process.execPath, ["scripts/check-mongodb.mjs"], { stdio: "inherit", timeout: 30000 });
  if (check.status !== 0) process.exit(1);
}
const files = readdirSync("tests/fiscal").filter(name => name.endsWith(".test.ts") && name.includes(".integration.") === integration);
const result = spawnSync(process.execPath, ["--require", "./scripts/lib/finance-cli.cjs", "--import", "tsx", "--test", ...files.map(name => `tests/fiscal/${name}`)], {
  stdio: "inherit", env: process.env,
});
process.exit(result.status ?? 1);
