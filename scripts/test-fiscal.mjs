import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const integration = process.argv.includes("--integration");
const files = readdirSync("tests/fiscal").filter(name => name.endsWith(".test.ts") && name.includes(".integration.") === integration);
const result = spawnSync(process.execPath, ["--require", "./scripts/lib/finance-cli.cjs", "--import", "tsx", "--test", ...files.map(name => `tests/fiscal/${name}`)], {
  stdio: "inherit", env: process.env,
});
process.exit(result.status ?? 1);
