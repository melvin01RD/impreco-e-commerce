import "server-only";
import type { ClientSession } from "mongoose";
import { runTransaction } from "@/lib/db-transaction";
import { FiscalInvoice } from "@/models/fiscal-invoice.model";
import { FiscalOutbox } from "@/models/fiscal-outbox.model";
import { FiscalEvent } from "@/models/fiscal-event.model";
import { assertIssuanceImplemented } from "../core/document-types";
import { FiscalError } from "../core/fiscal-errors";
import { serializeSnapshot } from "../core/snapshot";
import { validateSnapshotAmounts } from "../core/fiscal-validator";
import { decimalUnits } from "../core/tax-calculator";

/** Internal staging only; source builders must supply an approved immutable operation. */
export async function prepareFiscalDraft(input: unknown, actorId: string) {
  if (!actorId.trim() || actorId.length > 120) throw new FiscalError("INVALID_ORIGIN");
  const { snapshot, json, hash } = serializeSnapshot(input);
  validateSnapshotAmounts(snapshot);
  // E31/E32/E45 must not create multiple sales invoices for the same operation.
  const operationKey = `${snapshot.source.kind}:${snapshot.source.id}`;
  const identity = { environment: "sandbox", issuerTaxId: snapshot.issuer.taxId, operationKey };
  const replay = async (session?: ClientSession) => {
    const query = FiscalInvoice.findOne(identity);
    if (session) query.session(session);
    const existing = await query;
    if (existing && existing.snapshotHash !== hash) throw new FiscalError("IDEMPOTENCY_CONFLICT");
    return existing;
  };
  try {
    return await runTransaction("fiscal.prepare", async session => {
      const existing = await replay(session);
      if (existing) return existing;
      if (snapshot.originalId) {
        const original = await FiscalInvoice.findOne({ _id: snapshot.originalId, environment: identity.environment, issuerTaxId: identity.issuerTaxId, type: { $in: ["E31", "E32", "E45"] }, fiscalStatus: { $in: ["accepted", "conditionally_accepted"] } }).select("+snapshotJson").session(session);
        if (!original) throw new FiscalError("INVALID_ORIGIN");
        const originalSnapshot = serializeSnapshot(JSON.parse(original.snapshotJson)).snapshot;
        if (originalSnapshot.currency !== snapshot.currency ||
            JSON.stringify(originalSnapshot.buyer) !== JSON.stringify(snapshot.buyer)) throw new FiscalError("INVALID_ORIGIN");
        if (snapshot.type === "E34") {
          const amount = decimalUnits(snapshot.totals.total);
          const limit = decimalUnits(originalSnapshot.totals.total);
          if (amount > BigInt(Number.MAX_SAFE_INTEGER) || limit > BigInt(Number.MAX_SAFE_INTEGER)) throw new FiscalError("INVALID_AMOUNT");
          const reserved = await FiscalInvoice.updateOne({ _id: original._id, creditReservedMinor: { $lte: Number(limit - amount) }, version: original.version }, { $inc: { creditReservedMinor: Number(amount), version: 1 } }, { session });
          if (reserved.modifiedCount !== 1) throw new FiscalError("CREDIT_LIMIT");
          await FiscalEvent.create([{ invoiceId: original._id, version: original.version + 1, action: "credit_reserved", actorId }], { session });
        }
      }
      const [invoice] = await FiscalInvoice.create([{
        ...identity, type: snapshot.type, sourceKind: snapshot.source.kind, sourceId: snapshot.source.id,
        sourceReference: snapshot.source.reference, snapshotJson: json, snapshotHash: hash,
        originalId: snapshot.originalId,
      }], { session });
      await FiscalOutbox.create([{ invoiceId: invoice._id, status: "blocked", lastErrorCode: "ISSUANCE_BLOCKED" }], { session });
      await FiscalEvent.create([{ invoiceId: invoice._id, version: 0, action: "prepared", actorId }], { session });
      return invoice;
    });
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) {
      const existing = await replay();
      if (existing) return existing;
    }
    throw error;
  }
}

export async function requestFiscalIssuance(invoiceId: string): Promise<never> {
  const invoice = await FiscalInvoice.findById(invoiceId);
  if (!invoice) throw new FiscalError("INVALID_ORIGIN");
  // Enable only after source mapping, authorization, numbering and recovery contract validation.
  return assertIssuanceImplemented(invoice.type);
}
