import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMedasoftResult } from "../../lib/fiscal/providers/medasoft/mapper";
import { MedasoftSandboxProvider } from "../../lib/fiscal/providers/medasoft/client";

const config = { apiKey: "synthetic", apiSecret: "synthetic-secret", issuerTaxId: "000000000", timeoutMs: 50 };
const receipt = { encf: "E320000000001", trackId: "test", estado: "Aceptado", codigo: "1", secuenciaUtilizada: true };

test("provider state is explicit, not inferred from HTTP codes, signature or QR", () => {
  assert.equal(parseMedasoftResult(receipt).status, "accepted");
  assert.equal(parseMedasoftResult({ ...receipt, estado: "Rechazado", securityCode: "abcdef" }).status, "rejected");
  assert.equal(parseMedasoftResult({ ...receipt, estado: "En Proceso" }).status, "pending");
  assert.equal(parseMedasoftResult({ ...receipt, estado: "Aceptado Condicional" }).status, "conditionally_accepted");
  assert.throws(() => parseMedasoftResult({ ...receipt, estado: "new undocumented status" }), /OUTCOME_UNKNOWN/);
  assert.throws(() => parseMedasoftResult({ ...receipt, secuenciaUtilizada: false }), /OUTCOME_UNKNOWN/);
});

test("sandbox client checks issuer and actual provider environment and refuses production", async () => {
  for (const dgiiServer of ["testecf", "ecf", "certecf"]) {
    let calls = 0;
    const http: typeof fetch = async (url, init) => {
      calls++;
      assert.equal(init?.redirect, "error");
      if (String(url).endsWith("/login")) return Response.json({ token: "synthetic-jwt" });
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer synthetic-jwt");
      return Response.json({ registryNumber: "000000000", isActive: true, dgiiServer });
    };
    const provider = new MedasoftSandboxProvider(config, http);
    if (dgiiServer === "testecf") assert.equal((await provider.verifySandbox()).environment, "sandbox");
    else await assert.rejects(provider.verifySandbox(), /PROVIDER_UNVERIFIED/);
    assert.equal(calls, 2);
    await assert.rejects(provider.issue(), /PROVIDER_UNVERIFIED/);
    assert.equal(calls, 2);
  }
});

test("network failures, timeout and malformed authentication are bounded and redacted, without retries", async () => {
  let calls = 0;
  const provider = new MedasoftSandboxProvider(config, async () => { calls++; throw new Error(config.apiSecret); });
  await assert.rejects(provider.verifySandbox(), error => error instanceof Error && error.message === "PROVIDER_UNVERIFIED");
  assert.equal(calls, 1);
  const malformed = new MedasoftSandboxProvider(config, async () => Response.json({ token: 12 }));
  await assert.rejects(malformed.verifySandbox(), /PROVIDER_UNVERIFIED/);
  const timeout = new MedasoftSandboxProvider({ ...config, timeoutMs: 5 }, async (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
  }));
  await assert.rejects(timeout.verifySandbox(), /PROVIDER_UNVERIFIED/);
});
