import { spawn } from "node:child_process";
import { loadDevEnv, validateDevEnv } from "./lib/dev-env.mjs";

const env = loadDevEnv();
const errors = validateDevEnv(env);
if (errors.length) throw new Error(errors.join("\n"));
const build = process.argv[2] === "build";
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", ...(build
  ? ["build", "--webpack"] : ["dev", "--webpack", "--port", "3000"])], {
  env: { ...env, NODE_ENV: build ? "production" : "development" }, stdio: "inherit", windowsHide: true,
});
child.once("error", () => { console.error("Could not start Next DEV command."); process.exitCode = 1; });
child.once("exit", code => { process.exitCode = code ?? 1; });
