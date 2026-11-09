import { createRequire } from "node:module";
import { MongoClient } from "mongodb";

// Use the same loader and precedence as Next dev, including shell overrides.
const require = createRequire(import.meta.url);
const nextRequire = createRequire(require.resolve("next/package.json"));
const { loadEnvConfig } = nextRequire("@next/env");
export function loadDevEnv() {
  loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  return process.env;
}

export function validateDevEnv(env = process.env) {
  const errors = [];
  const placeholder = /[<>]|placeholder|cluster-host|your[_-]|change.?me/i;
  const uri = env.MONGODB_URI || "";
  const uriHost = uri.replace(/^mongodb(?:\+srv)?:\/\//, "").split(/[/?]/)[0].split("@").pop() || "";
  const exampleHost = /(?:^|[.,])(?:x{3,}|example|cluster-host|placeholder|your-cluster)(?=[.:,]|$)|\.invalid(?=[:,]|$)/i.test(uriHost);
  let validSyntax = false;
  try {
    // Constructor validation only: no DNS lookup, socket or database operation.
    new MongoClient(uri);
    validSyntax = true;
  } catch { /* Never expose parser errors: they can contain credentials. */ }
  if (!uri) {
    errors.push("MONGODB_URI: falta completar esta variable en .env con la URI real de Atlas.");
  } else if (!validSyntax || /[<>]/.test(uri) || exampleHost) {
    errors.push("MONGODB_URI: formato inválido o host de ejemplo; revise la URI de Atlas en .env.");
  }
  if (env.MONGODB_DB_NAME !== "storify_catalina_dev") errors.push("MONGODB_DB_NAME debe ser storify_catalina_dev.");
  for (const key of ["BETTER_AUTH_SECRET", "INSTALL_TOKEN"]) {
    if (!env[key] || placeholder.test(env[key])) errors.push(`${key}: falta un secreto válido.`);
  }
  for (const key of ["BETTER_AUTH_URL", "NEXT_PUBLIC_APP_URL"]) {
    if (env[key] !== "http://localhost:3000") errors.push(`${key} debe ser http://localhost:3000 para DEV.`);
  }
  if (env.NODE_ENV === "production") errors.push("Este comando es exclusivo de DEV.");
  if (env.FISCAL_PROVIDER_MODE !== "dgii-free" || env.FISCAL_MEDASOFT_NETWORK !== "false") {
    errors.push("DEV requiere FISCAL_PROVIDER_MODE=dgii-free y FISCAL_MEDASOFT_NETWORK=false.");
  }
  return errors;
}
