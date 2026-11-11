import { execFileSync } from "node:child_process";

export default function setup() {
  const invoke = (mode: string) => execFileSync(process.execPath, [
    "--import", "./scripts/lib/load-dev-env.mjs", "--require", "./scripts/lib/finance-cli.cjs",
    "--import", "tsx", "scripts/fiscal-dev-fixtures.ts", mode,
  ], { stdio: "inherit", timeout: 120000 });
  execFileSync(process.execPath, ["scripts/check-mongodb.mjs"], { stdio: "inherit", timeout: 30000 });
  invoke("seed");
  return () => invoke("cleanup");
}
