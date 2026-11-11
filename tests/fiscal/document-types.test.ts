import { test } from "node:test";
import assert from "node:assert/strict";
import { DOCUMENT_TYPES, assertDocumentOrigin, assertIssuanceImplemented, parseDocumentType } from "../../lib/fiscal/core/document-types";

test("only seven requested types are registered; unsupported and inherited keys fail", () => {
  assert.equal(DOCUMENT_TYPES.length, 7);
  for (const type of DOCUMENT_TYPES) assert.equal(parseDocumentType(type), type);
  for (const type of ["E44", "E46", "E47", "toString", "__proto__", null]) {
    assert.throws(() => parseDocumentType(type), /UNSUPPORTED_TYPE/);
  }
});

test("purchases and expenses cannot originate in sales checkout", () => {
  assertDocumentOrigin("E41", "purchase");
  assertDocumentOrigin("E43", "expense");
  assertDocumentOrigin("E45", "order");
  assert.throws(() => assertDocumentOrigin("E41", "order"), /INVALID_ORIGIN/);
  assert.throws(() => assertDocumentOrigin("E43", "order"), /INVALID_ORIGIN/);
  assert.throws(() => assertDocumentOrigin("E34", "adjustment"), /INVALID_ORIGIN/);
  assertDocumentOrigin("E34", "adjustment", "original");
  assertDocumentOrigin("E33", "adjustment", "original");
});

test("registration never enables issuance", () => {
  for (const type of DOCUMENT_TYPES) assert.throws(() => assertIssuanceImplemented(type), /ISSUANCE_BLOCKED/);
});
