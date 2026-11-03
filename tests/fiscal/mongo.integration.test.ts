import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { FiscalInvoice } from "../../models/fiscal-invoice.model";
import { FiscalEvent } from "../../models/fiscal-event.model";
import { FiscalOutbox } from "../../models/fiscal-outbox.model";
import { serializeSnapshot } from "../../lib/fiscal/core/snapshot";
import { fixture } from "./fixtures";
import { prepareFiscalDraft, requestFiscalIssuance } from "../../lib/fiscal/services/issuance";
import { recordFiscalTransition } from "../../lib/fiscal/services/fiscal-audit";

test("isolated replica set enforces uniqueness, immutable snapshot and transactional rollback", { timeout: 180000 }, async () => {
  // Explicitly created ephemeral replica set; never reads MONGODB_URI or dotenv.
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: "8.0.17", downloadDir: "node_modules/.cache/mongodb-binaries" } });
  try {
    await mongoose.connect(replica.getUri(), { dbName: "fiscal_integration" });
    await Promise.all([FiscalInvoice.init(), FiscalEvent.init(), FiscalOutbox.init()]);
    const snapshot = serializeSnapshot(fixture());
    const input = { environment: "sandbox", issuerTaxId: "000000000", type: "E32", sourceKind: "order", sourceId: "synthetic-order", sourceReference: "TEST-001", operationKey: "sale:synthetic-order", snapshotJson: snapshot.json, snapshotHash: snapshot.hash } as const;
    const concurrent = await Promise.allSettled(Array.from({ length: 6 }, () => FiscalInvoice.create(input)));
    assert.equal(concurrent.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(await FiscalInvoice.countDocuments(), 1);
    const invoice = await FiscalInvoice.findOne().select("+snapshotJson").orFail();
    await assert.rejects(FiscalInvoice.updateOne({ _id: invoice._id }, { $set: { snapshotJson: "changed" } }), /FISCAL_IMMUTABLE_UPDATE/);
    await assert.rejects(FiscalInvoice.updateOne({ _id: invoice._id }, [{ $set: { snapshotJson: "changed" } }], { updatePipeline: true }), /FISCAL_IMMUTABLE_UPDATE/);
    assert.equal((await FiscalInvoice.findById(invoice._id).select("+snapshotJson").orFail()).snapshotJson, snapshot.json);
    const session = await mongoose.startSession();
    try {
      await assert.rejects(session.withTransaction(async () => {
        await FiscalOutbox.create([{ invoiceId: invoice._id }], { session });
        await FiscalEvent.create([{ invoiceId: invoice._id, version: 0, action: "prepared", actorId: "test" }], { session });
        throw new Error("simulate rollback");
      }), /simulate rollback/);
      assert.equal(await FiscalOutbox.countDocuments(), 0);
      assert.equal(await FiscalEvent.countDocuments(), 0);
    } finally { await session.endSession(); }

    const staged = fixture(); staged.source.id = "transactional-order";
    const preparations = await Promise.all(Array.from({ length: 4 }, () => prepareFiscalDraft(staged, "test")));
    assert.equal(new Set(preparations.map(doc => String(doc._id))).size, 1);
    const original = preparations[0];
    assert.equal(await FiscalOutbox.countDocuments({ invoiceId: original._id }), 1);
    assert.equal(await FiscalEvent.countDocuments({ invoiceId: original._id }), 1);
    const changed = fixture(); changed.source.id = staged.source.id; changed.buyer.legalName = "changed";
    await assert.rejects(prepareFiscalDraft(changed, "test"), /IDEMPOTENCY_CONFLICT/);
    await assert.rejects(requestFiscalIssuance(String(original._id)), /ISSUANCE_BLOCKED/);
    // Simulated provider evidence, only in this isolated test database.
    await FiscalInvoice.updateOne({ _id: original._id }, { $set: { transmission: "sending" } });
    const result = { encf: "E320000000001", providerId: "synthetic-track", status: "accepted" as const };
    await recordFiscalTransition(String(original._id), 0, { kind: "result", status: "accepted" }, "mock-provider", result);
    await assert.rejects(recordFiscalTransition(String(original._id), 0, { kind: "unknown" }, "stale-worker"), /CONCURRENT_OPERATION/);

    const credit = (id: string) => {
      const note = fixture(); note.type = "E34"; note.source = { kind: "adjustment", id, reference: id };
      note.originalId = String(original._id);
      note.lines[0] = { ...note.lines[0], unitPrice: "60.00", base: "60.00", tax: "10.80", total: "70.80" };
      note.totals = { base: "60.00", tax: "10.80", total: "70.80", nonBillable: "0.00" };
      return note;
    };
    const notes = await Promise.allSettled([prepareFiscalDraft(credit("return-a"), "test"), prepareFiscalDraft(credit("return-b"), "test")]);
    assert.equal(notes.filter(note => note.status === "fulfilled").length, 1);
    assert.equal(notes.filter(note => note.status === "rejected").length, 1);
    assert.equal((await FiscalInvoice.findById(original._id).orFail()).creditReservedMinor, 7080);
    assert.equal(await FiscalInvoice.countDocuments({ originalId: original._id }), 1);
    const debit = fixture(); debit.type = "E33"; debit.source = { kind: "adjustment", id: "debit-a", reference: "DEBIT" }; debit.originalId = String(original._id);
    assert.equal((await prepareFiscalDraft(debit, "test")).type, "E33");
    for (const [type, kind] of [["E41", "purchase"], ["E43", "expense"], ["E45", "order"]] as const) {
      const draft = fixture(); draft.type = type; draft.source = { kind, id: type, reference: type };
      const document = await prepareFiscalDraft(draft, "test");
      assert.equal(document.type, type);
      await assert.rejects(requestFiscalIssuance(String(document._id)), /ISSUANCE_BLOCKED/);
    }
  } finally { await mongoose.disconnect(); await replica.stop(); }
});
