import test from "node:test";
import assert from "node:assert/strict";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { authorizedPreviewOrigins, createTrustedOrigins } from "../lib/auth/trusted-origins";

const preview = "https://impreco-pnjxsyit4-melvin01rds-projects.vercel.app";

test("allowlist normalizes exact origins and removes duplicates", () => {
  assert.deepEqual(authorizedPreviewOrigins(` ${preview}/,${preview} `), [preview]);
  assert.deepEqual(authorizedPreviewOrigins(undefined), []);
});

test("rejects wildcards, HTTP, local hosts, credentials and non-origin URLs without echoing secrets", () => {
  for (const value of ["https://*.vercel.app", "http://preview.vercel.app", "https://localhost", "https://10.0.0.1", "https://user:secret@example.com", `${preview}/login`, `${preview}?token=secret`, `${preview}#secret`, `${preview},`, "not-an-origin"]) {
    assert.throws(() => authorizedPreviewOrigins(value), (error: Error) => {
      assert.ok(!error.message.includes("secret"));
      return /exact public HTTPS origins/.test(error.message);
    });
  }
});

test("hosted allowlist cannot be expanded by Origin, Host or forwarded headers", () => {
  const trusted = createTrustedOrigins([preview], false);
  for (const origin of ["https://another.vercel.app", `${preview}.attacker.test`, "http://localhost:3000"]) {
    assert.deepEqual(trusted(new Request(`${preview}/api/auth/sign-in/email`, {
      headers: { origin, host: new URL(origin).host, "x-forwarded-host": new URL(origin).host },
    })), [preview]);
  }
});

test("local LAN testing remains same-host only", () => {
  const trusted = createTrustedOrigins(["http://localhost:3000"], true);
  const origin = "http://192.168.1.5:3000";
  assert.ok(trusted(new Request(`${origin}/api/auth`, { headers: { origin, host: "192.168.1.5:3000" } })).includes(origin));
  assert.ok(!trusted(new Request(`${origin}/api/auth`, { headers: { origin, host: "other.test" } })).includes(origin));
});

test("Better Auth rejects an unlisted origin and accepts the exact Preview with CSRF and rate limiting enabled", async () => {
  // In-memory synthetic fixture only: no Atlas, real user or email requests.
  const auth = betterAuth({
    baseURL: "https://canonical.example.invalid",
    secret: "synthetic-test-only-secret-with-at-least-32-characters",
    database: memoryAdapter({ user: [], account: [], session: [], verification: [] }),
    trustedOrigins: createTrustedOrigins(authorizedPreviewOrigins(preview), false),
    emailAndPassword: { enabled: true },
    rateLimit: { enabled: true, storage: "memory", customRules: { "/sign-in/email": { window: 60, max: 8 } } },
    logger: { disabled: true },
  });
  async function attempt(origin: string) {
    return auth.handler(new Request(`${preview}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { origin, "content-type": "application/json", "x-forwarded-for": "192.0.2.10" },
      body: JSON.stringify({ email: "synthetic@example.invalid", password: "Synthetic-only-123!" }),
    }));
  }
  const rejected = await attempt("https://untrusted.vercel.app");
  assert.equal(rejected.status, 403);
  assert.equal((await rejected.json()).code, "INVALID_ORIGIN");
  // An unknown synthetic user gets 401, proving the origin gate was passed.
  const accepted = await attempt(preview);
  assert.equal(accepted.status, 401);
  assert.equal((await accepted.json()).code, "INVALID_EMAIL_OR_PASSWORD");
});
