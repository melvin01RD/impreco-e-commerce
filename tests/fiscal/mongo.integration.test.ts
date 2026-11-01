import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { FiscalInvoice } from "../../models/fiscal-invoice.model";
import { FiscalEvent } from "../../models/fiscal-event.model";
import { FiscalOutbox } from "../../models/fiscal-outbox.model";
import { serializeSnapshot } from "../../lib/fiscal/core/snapshot";
import { fixture } from "./fixtures";

test("isolated replica set enforces uniqueness, immutable snapshot and transactional rollback", { timeout: 180000 }, async () => {
  // Explicitly created ephemeral replica set; never reads MONGODB_URI or dotenv.
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: "8.0.17", downloadDir: "node_modules/.cache/mongodb-binaries" } });
  try {
    await mongoose.connect(replica.getUri(), { dbName: "fiscal_integration" });
    await Promise.all([FiscalInvoice.init(), FiscalEvent.init(), FiscalOutbox.init()]);
    const snapshot = serializeSnapshot(fixture());
    const input = { environment: "sandbox", issuerTaxId: "000000000", type: "E32", sourceKind: "order", sourceId: "synthetic-order", sourceReference: "TEST-001", operationKey: "sale:synthetic-order", snapshotJson: snapshot.json, snapshotHash: snapshot.hash };
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
  } finally { await mongoose.disconnect(); await replica.stop(); }
});
