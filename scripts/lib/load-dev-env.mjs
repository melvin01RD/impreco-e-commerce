import { loadDevEnv, validateDevEnv } from "./dev-env.mjs";
const errors = validateDevEnv(loadDevEnv());
if (errors.length) throw new Error(errors.join("\n"));
