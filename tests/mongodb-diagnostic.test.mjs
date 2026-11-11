import test from "node:test";
import assert from "node:assert/strict";
import { diagnoseMongoError } from "../scripts/lib/mongodb-diagnostic.mjs";

test("Atlas authentication failure retains its code without exposing driver details", () => {
  const output = diagnoseMongoError({ code: 8000, message: "bad auth : authentication failed mongodb+srv://secret-user:secret-password@private-host/" });
  assert.match(output, /autenticación \(códigos: 8000\)/);
  for (const secret of ["secret-user", "secret-password", "private-host", "mongodb+srv"]) assert.ok(!output.includes(secret));
});

test("nested topology and cause errors distinguish TLS, DNS, network and permissions", () => {
  for (const [code, expected] of [["CERT_HAS_EXPIRED", "TLS"], ["ENOTFOUND", "DNS/SRV"], ["ECONNREFUSED", "red"], [13, "permisos de lectura"], [18, "autenticación"]]) {
    const error = { name: "MongoServerSelectionError", reason: { servers: new Map([["private-host", { error: { cause: { code } } }]]) } };
    assert.ok(diagnoseMongoError(error).startsWith(expected));
  }
});

test("DNS syscall disambiguates a network timeout and traversal handles cycles", () => {
  const error = { code: "ETIMEDOUT", syscall: "querySrv" };
  error.cause = error;
  assert.match(diagnoseMongoError(error), /^DNS\/SRV/);
});

test("unknown fields and codes cannot leak secrets or imply authentication failure", () => {
  const output = diagnoseMongoError({ name: "private-host", code: "secret-password", message: "mongodb://secret-user:secret-password@private-host", codeName: "secret-user" });
  assert.match(output, /^indeterminado/);
  assert.ok(!/secret|private-host|mongodb:\/\//.test(output));
  assert.match(diagnoseMongoError({ name: "MongoServerSelectionError" }), /Sin causa concluyente/);
});
