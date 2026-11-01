import { test } from "node:test";
import assert from "node:assert/strict";
import { FiscalInvoice } from "../../models/fiscal-invoice.model";
import { FiscalEvent } from "../../models/fiscal-event.model";
import { FiscalOutbox } from "../../models/fiscal-outbox.model";
import { FiscalSettings } from "../../models/fiscal-settings.model";

test("fiscal schemas default to disabled, unverified and blocked", () => {
  assert.equal(new FiscalInvoice().fiscalStatus, "unverified");
  assert.equal(new FiscalOutbox().status, "blocked");
  assert.equal(new FiscalSettings().enabled, false);
  assert.deepEqual(new FiscalSettings().enabledTypes, []);
});

test("unique indexes protect business operations, e-NCF, event versions and outbox", () => {
  const indexes = FiscalInvoice.schema.indexes();
  assert.ok(indexes.some(([keys, options]) => keys.operationKey && options.unique));
  assert.ok(indexes.some(([keys, options]) => keys.encf && options.unique && options.partialFilterExpression));
  assert.ok(FiscalEvent.schema.indexes().some(([keys, options]) => keys.version && options.unique));
  assert.ok(FiscalOutbox.schema.indexes().some(([keys, options]) => keys.invoiceId && options.unique));
  assert.ok(!FiscalOutbox.schema.indexes().some(([, options]) => options.expireAfterSeconds !== undefined));
});

test("documents cannot be replaced and audit events cannot be rewritten", async () => {
  await assert.rejects(FiscalInvoice.replaceOne({}, {}), /FISCAL_DOCUMENT_APPEND_ONLY/);
  await assert.rejects(FiscalInvoice.deleteMany({}), /FISCAL_DOCUMENT_APPEND_ONLY/);
  await assert.rejects(FiscalEvent.updateOne({}, { code: "changed" }), /FISCAL_EVENT_APPEND_ONLY/);
  assert.equal(FiscalInvoice.schema.path("snapshotJson").options.immutable, true);
  assert.equal(FiscalInvoice.schema.path("snapshotJson").options.select, false);
});
