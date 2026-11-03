import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSalesDocumentType } from "../../lib/fiscal/core/document-resolver";

test("consumer defaults to E32; tax credit is an explicit E31 request", () => {
  assert.equal(resolveSalesDocumentType(undefined), "E32");
  assert.equal(resolveSalesDocumentType("E32"), "E32");
  assert.equal(resolveSalesDocumentType("E31"), "E31");
  for (const value of ["E41", "E43", "E45", "business", true, { company: "company" }]) {
    assert.throws(() => resolveSalesDocumentType(value), /UNSUPPORTED_TYPE/);
  }
});
