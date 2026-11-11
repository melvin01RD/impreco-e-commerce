import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { connectFiscalDevSandbox } from "../../scripts/lib/fiscal-dev-isolation.mjs";
import { Order } from "../../models/order.model";
import { FiscalCase, FiscalCaseEvent, FiscalOfficialClaim, FiscalEvidence } from "../../models/fiscal-case.model";
import { prepareCase, executeCaseCommand, getCaseDetail } from "../../lib/fiscal/manual/service";
import { manualOrder, manualInput, manualCapture } from "./manual-fixtures";

test("free invoicer: atomic preparation, immutable snapshot, duplicate claims, version races, evidence and audited reconciliation", { timeout: 180000 }, async () => {
  const sandbox = await connectFiscalDevSandbox();
  try {
    await Promise.all([Order, FiscalCase, FiscalCaseEvent, FiscalOfficialClaim, FiscalEvidence].map(model => model.init()));
    const firstOrder = { ...manualOrder(), _id: new mongoose.Types.ObjectId(manualInput().orderId), paymentStatus: "paid", stock: "sentinel" };
    const secondInput = manualInput("000000000000000000000022");
    await Order.collection.insertMany([firstOrder, { ...manualOrder(secondInput.orderId), _id: new mongoose.Types.ObjectId(secondInput.orderId) }] as never[]);
    const beforeOrder = await Order.collection.findOne({ _id: firstOrder._id });
    const preparations = await Promise.all(Array.from({ length: 5 }, () => prepareCase(manualInput(), "admin-synthetic")));
    const id = preparations[0].id;
    assert.equal(new Set(preparations.map(row => row.id)).size, 1);
    assert.equal(await FiscalCaseEvent.countDocuments({ caseId: id }), 1);
    assert.equal((await getCaseDetail(id)).encf, undefined);
    assert.equal((await getCaseDetail(id)).state, "PENDIENTE_EMISION");
    await assert.rejects(prepareCase({ ...manualInput(), buyer: { legalName: "Changed" } }, "admin"), /EXPEDIENTE_EXISTENTE/);
    await assert.rejects(FiscalCase.updateOne({ _id: id }, { $set: { snapshotJson: "tampered" } }), /IMMUTABLE/);
    await assert.rejects(FiscalCaseEvent.updateOne({ caseId: id }, { $set: { actorId: "forged" } }), /APPEND_ONLY/);
    const other = await prepareCase(secondInput, "admin");
    const evidence = await FiscalEvidence.create({ caseId: id, key: "fiscal-evidence/test", mime: "application/pdf", size: 20, sha256: "a".repeat(64), source: "FACTURADOR_GRATUITO_DGII", sourceReference: "Synthetic official evidence", actorId: "admin" });
    const otherEvidence = await FiscalEvidence.create({ caseId: other.id, key: "fiscal-evidence/test-other", mime: "application/pdf", size: 20, sha256: "b".repeat(64), source: "FACTURADOR_GRATUITO_DGII", sourceReference: "Synthetic other evidence", actorId: "admin" });
    const register = { action: "register", expectedVersion: 0, requestId: randomUUID(), reason: "Transcripción sintética oficial", official: manualCapture(String(evidence._id)) };
    await assert.rejects(executeCaseCommand(id, { ...register, official: { ...register.official, evidenceId: String(otherEvidence._id) } }, "admin"), /EVIDENCIA_NO_PERTENECE/);
    const attempts = await Promise.all(Array.from({ length: 4 }, () => executeCaseCommand(id, register, "admin")));
    assert.ok(attempts.every(result => result.version === 1));
    assert.equal(await FiscalCaseEvent.countDocuments({ caseId: id }), 2);
    let detail = await getCaseDetail(id);
    assert.equal(detail.state, "PENDIENTE_VERIFICACION");
    assert.equal(detail.officialStatus, "ACEPTADO");
    assert.equal(detail.reviewedAt, null);
    await assert.rejects(executeCaseCommand(other.id, { ...register, requestId: randomUUID(), official: { ...register.official, evidenceId: String(otherEvidence._id) } }, "admin"), /E_NCF/);
    assert.equal((await getCaseDetail(other.id)).version, 0);
    await assert.rejects(executeCaseCommand(id, { ...register, reason: "Reusing key differently" }, "admin"), /CLAVE_IDEMPOTENTE/);
    const verification = { action: "verify", expectedVersion: 1, requestId: randomUUID(), reason: "Revisión oficial sintética", evidenceId: String(evidence._id), status: "ACEPTADO_CONDICIONAL", checkedOfficialSource: true, sourceReference: "Consulta sintética oficial" };
    const races = await Promise.allSettled([executeCaseCommand(id, verification, "reviewer"), executeCaseCommand(id, { ...verification, requestId: randomUUID(), status: "RECHAZADO" }, "reviewer")]);
    assert.equal(races.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(races.filter(r => r.status === "rejected").length, 1);
    detail = await getCaseDetail(id);
    assert.equal(detail.version, 2);
    assert.ok(detail.reviewedAt);
    // Re-registering a different official amount does not rewrite snapshot and cannot reconcile.
    await executeCaseCommand(id, { ...register, expectedVersion: 2, requestId: randomUUID(), official: { ...register.official, base: "101.00", tax: "18.00", total: "119.00" } }, "admin");
    await executeCaseCommand(id, { ...verification, expectedVersion: 3, requestId: randomUUID(), status: "ACEPTADO" }, "reviewer");
    detail = await getCaseDetail(id);
    assert.equal(detail.state, "REQUIERE_CORRECCION");
    assert.equal(detail.snapshot.totals.total, "118.00");
    await executeCaseCommand(id, { ...register, expectedVersion: 4, requestId: randomUUID() }, "admin");
    await executeCaseCommand(id, { ...verification, expectedVersion: 5, requestId: randomUUID() }, "reviewer");
    assert.equal((await getCaseDetail(id)).state, "CONCILIADO");
    assert.deepEqual(await Order.collection.findOne({ _id: firstOrder._id }), beforeOrder);
    assert.equal(await FiscalOfficialClaim.countDocuments(), 1);
    assert.equal(await FiscalCaseEvent.countDocuments({ caseId: id }), 7);
    // E33 is not a second invoice on the original order: a separate commercial adjustment is required.
    const debitOrderId = "000000000000000000000023";
    const debit = { ...manualInput(debitOrderId), type: "E33", originalCaseId: id, adjustmentReason: "Ajuste comercial sintético" };
    await Order.collection.insertOne({ ...manualOrder(debitOrderId), _id: new mongoose.Types.ObjectId(debitOrderId) } as never);
    await assert.rejects(prepareCase(debit, "admin"), /Revisar/); // E33 requires identified recipient.
    const identifiedOrderId = "000000000000000000000024";
    const adjustmentOrderId = "000000000000000000000025";
    const buyer = { taxId: "111111111", legalName: "Receptor sintético" };
    await Order.collection.insertMany([identifiedOrderId, adjustmentOrderId].map(orderId => ({ ...manualOrder(orderId), _id: new mongoose.Types.ObjectId(orderId) })) as never[]);
    const sale = await prepareCase({ ...manualInput(identifiedOrderId), type: "E31", buyer }, "admin");
    const saleEvidence = await FiscalEvidence.create({ caseId: sale.id, key: "fiscal-evidence/sale", mime: "application/pdf", size: 20, sha256: "c".repeat(64), source: "FACTURADOR_GRATUITO_DGII", sourceReference: "Synthetic sale", actorId: "admin" });
    await assert.rejects(executeCaseCommand(sale.id, { ...register, requestId: randomUUID(), official: { ...manualCapture(String(saleEvidence._id)), type: "E31", encf: "E31123", buyer } }, "admin"), { name: "ZodError" });
    const originalEncf = "E31" + "0000000024";
    await executeCaseCommand(sale.id, { ...register, requestId: randomUUID(), official: { ...manualCapture(String(saleEvidence._id)), type: "E31", encf: originalEncf, buyer } }, "admin");
    await executeCaseCommand(sale.id, { ...verification, requestId: randomUUID(), evidenceId: String(saleEvidence._id) }, "reviewer");
    const adjustment = await prepareCase({ ...manualInput(adjustmentOrderId), type: "E33", buyer, originalCaseId: sale.id, adjustmentReason: "Ajuste respaldado por otro pedido" }, "admin");
    const adjustmentEvidence = await FiscalEvidence.create({ caseId: adjustment.id, key: "fiscal-evidence/adjustment", mime: "application/pdf", size: 20, sha256: "d".repeat(64), source: "FACTURADOR_GRATUITO_DGII", sourceReference: "Synthetic adjustment", actorId: "admin" });
    await executeCaseCommand(adjustment.id, { ...register, requestId: randomUUID(), official: { ...manualCapture(String(adjustmentEvidence._id)), type: "E33", encf: "E33" + "0000000025", buyer, originalEncf } }, "admin");
    await executeCaseCommand(adjustment.id, { ...verification, requestId: randomUUID(), evidenceId: String(adjustmentEvidence._id) }, "reviewer");
    assert.equal((await getCaseDetail(adjustment.id)).state, "CONCILIADO");
    const auditFailure = mock.method(FiscalCaseEvent, "create", async () => { throw new Error("synthetic audit outage"); });
    try {
      await assert.rejects(executeCaseCommand(adjustment.id, { action: "correction", expectedVersion: 2, requestId: randomUUID(), reason: "Synthetic failed correction" }, "admin"), /synthetic audit outage/);
    } finally { auditFailure.mock.restore(); }
    assert.equal((await getCaseDetail(adjustment.id)).state, "CONCILIADO");
    assert.equal((await getCaseDetail(adjustment.id)).version, 2);
  } finally { await sandbox.close(); }
});
