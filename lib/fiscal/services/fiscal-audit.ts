import "server-only";
import { runTransaction } from "@/lib/db-transaction";
import { FiscalInvoice } from "@/models/fiscal-invoice.model";
import { FiscalEvent } from "@/models/fiscal-event.model";
import { FiscalOutbox } from "@/models/fiscal-outbox.model";
import { FiscalError } from "../core/fiscal-errors";
import { transitionFiscal, type FiscalAction } from "../core/state-machine";
import type { ProviderResult } from "../providers/fiscal-provider.interface";
import { medasoftNetworkEnabled } from "../providers/mode";

/** Optimistic state update and audit share one transaction; stale workers cannot overwrite. */
export async function recordFiscalTransition(invoiceId: string, expectedVersion: number, action: FiscalAction, actorId: string, result?: ProviderResult) {
  if (!medasoftNetworkEnabled()) throw new FiscalError("ISSUANCE_BLOCKED");
  if (!actorId.trim() || actorId.length > 120) throw new FiscalError("INVALID_ORIGIN");
  return runTransaction("fiscal.transition", async session => {
    const invoice = await FiscalInvoice.findOne({ _id: invoiceId, version: expectedVersion }).session(session);
    if (!invoice) throw new FiscalError("CONCURRENT_OPERATION");
    // No runtime path may bypass the issuance code gate by directly enqueueing a draft.
    if (action.kind === "queue" || action.kind === "send") throw new FiscalError("ISSUANCE_BLOCKED");
    const next = transitionFiscal(invoice, action);
    if (action.kind === "result" && (!result || result.status !== action.status || !result.providerId ||
        !new RegExp(`^${invoice.type}\\d{10}$`).test(result.encf) ||
        (invoice.encf && result.encf !== invoice.encf) || (invoice.providerId && result.providerId !== invoice.providerId))) {
      throw new FiscalError("OUTCOME_UNKNOWN");
    }
    const evidence = action.kind === "result" && result ? { encf: result.encf, providerId: result.providerId, verifiedAt: new Date() } : {};
    const changed = await FiscalInvoice.updateOne({ _id: invoiceId, version: expectedVersion }, {
      $set: { ...next, ...evidence, lastErrorCode: action.kind === "unknown" ? "OUTCOME_UNKNOWN" : undefined },
      $inc: { version: 1 },
    }, { session, runValidators: true });
    if (changed.modifiedCount !== 1) throw new FiscalError("CONCURRENT_OPERATION");
    await FiscalOutbox.updateOne({ invoiceId }, { $set: { status: next.transmission === "unknown" ? "unknown" : next.fiscalStatus === "pending" || next.transmission === "reconciling" ? "blocked" : "done" }, $unset: { leaseToken: 1, leaseUntil: 1 } }, { session });
    await FiscalEvent.create([{ invoiceId, version: expectedVersion + 1, action: action.kind === "reconcile" ? "reconciling" : action.kind, actorId, code: action.kind === "unknown" ? "OUTCOME_UNKNOWN" : undefined }], { session });
    return { ...next, version: expectedVersion + 1 };
  });
}
