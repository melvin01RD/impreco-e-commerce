import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOrderSnapshot, captureMatches, reconciledState, orderMoney } from "../../lib/fiscal/manual/snapshot";
import { manualInput, manualOrder, manualCapture } from "./manual-fixtures";
import { caseCommandSchema, officialSchema, evidenceType, prepareCaseSchema } from "../../lib/fiscal/manual/contracts";
import { FiscalCase, FiscalOfficialClaim } from "../../models/fiscal-case.model";

test("manual snapshot contains exact order lines, totals and immutable hash without e-NCF", () => {
  const order = manualOrder(); const input = manualInput();
  const result = buildOrderSnapshot(order, input);
  assert.equal(result.snapshot.totals.total, "118.00");
  assert.equal(result.snapshot.lines[0].quantity, "1");
  assert.equal(result.hash, buildOrderSnapshot(order, input).hash);
  order.items[0].name = "Changed";
  assert.equal(result.snapshot.lines[0].description, "Artículo sintético");
  assert.notEqual(buildOrderSnapshot(order, input).hash, result.hash);
  assert.ok(!("encf" in result.snapshot));
});
test("preparation refuses incorrect amounts, missing currency, unsupported duty and client-provided snapshot", () => {
  for (const patch of [{ total: 119 }, { tax: 17 }, { subtotal: 101 }, { currency: undefined }, { currency: "USD" }, { status: "cancelled" }, { customs: { dutyAmount: 1, collectedAtCheckout: true } }]) assert.throws(() => buildOrderSnapshot({ ...manualOrder(), ...patch }, manualInput()));
  assert.throws(() => orderMoney(0.001));
  assert.throws(() => prepareCaseSchema.parse({ ...manualInput(), snapshot: {} }));
  assert.throws(() => buildOrderSnapshot(manualOrder(), { ...manualInput(), classifications: [] }));
});
test("discount allocation and classified shipping reconcile without modifying commercial totals", () => {
  const order = { ...manualOrder(), discount: 10, tax: 16.2, shippingCost: 5, total: 111.2 };
  const input = { ...manualInput(), shippingClassification: { treatment: "exempt" as const, rate: "0", classificationReference: "Test shipping" } };
  const snapshot = buildOrderSnapshot(order, input).snapshot;
  assert.equal(snapshot.lines[0].discount, "10.00");
  assert.equal(snapshot.lines[1].total, "5.00");
  assert.equal(snapshot.totals.total, "111.20");
});
test("official capture and human verification are separate and mismatches never reconcile", () => {
  const snapshot = buildOrderSnapshot(manualOrder(), manualInput()).snapshot;
  const capture = manualCapture("000000000000000000000031");
  assert.ok(captureMatches(snapshot, capture));
  assert.ok(!captureMatches(snapshot, { ...capture, total: "119.00" }));
  assert.equal(reconciledState("ACEPTADO", false), "REQUIERE_CORRECCION");
  assert.equal(reconciledState("ACEPTADO_CONDICIONAL", true), "CONCILIADO");
  assert.equal(reconciledState("EN_PROCESO", true), "PENDIENTE_VERIFICACION");
  assert.equal(reconciledState("RECHAZADO", true), "REQUIERE_CORRECCION");
  assert.throws(() => caseCommandSchema.parse({ action: "verify", expectedVersion: 0, requestId: "00000000-0000-4000-8000-000000000001", reason: "Test evidence", status: "ACEPTADO", evidenceId: capture.evidenceId, sourceReference: "Test origin", checkedOfficialSource: false }));
});
test("official numbers, dates, E33 references and file signatures are validated", () => {
  const capture = manualCapture("000000000000000000000031");
  assert.throws(() => officialSchema.parse({ ...capture, encf: "E310000000001" }));
  assert.throws(() => officialSchema.parse({ ...capture, issuedOn: "2026-02-30" }));
  assert.throws(() => officialSchema.parse({ ...capture, issuedOn: "2099-01-01" }));
  assert.throws(() => officialSchema.parse({ ...capture, type: "E33", encf: "E3300000000010" }));
  assert.throws(() => evidenceType(Buffer.from("<script>"), "application/pdf"));
  assert.equal(evidenceType(Buffer.from("%PDF-1.7 synthetic"), "application/pdf"), "pdf");
  assert.throws(() => evidenceType(Buffer.from("%PDF-1.7"), "text/html"));
});
test("manual persistence defaults pending emission and reserves official issuer/number globally", () => {
  assert.equal(new FiscalCase().state, "PENDIENTE_EMISION");
  assert.equal(new FiscalCase().officialStatus, undefined);
  assert.ok(FiscalOfficialClaim.schema.indexes().some(([key, options]) => key.issuerTaxId === 1 && key.encf === 1 && options.unique && !key.environment));
});
