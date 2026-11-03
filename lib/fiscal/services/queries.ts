import "server-only";
import * as z from "zod";
import { FiscalInvoice, FISCAL_STATES } from "@/models/fiscal-invoice.model";
import { FiscalEvent } from "@/models/fiscal-event.model";
import { DOCUMENT_CATALOG, DOCUMENT_TYPES } from "../core/document-types";

export const fiscalListSchema = z.object({
  type: z.enum(DOCUMENT_TYPES).optional(),
  status: z.enum(FISCAL_STATES).optional(),
  environment: z.enum(["sandbox", "production"]).default("sandbox"),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export function fiscalCapabilities() {
  return {
    issuanceEnabled: false, reconciliationEnabled: false, blocker: "PROVIDER_UNVERIFIED",
    types: DOCUMENT_TYPES.map(type => ({ type, ...DOCUMENT_CATALOG[type], enabled: false })),
  };
}

export async function listFiscalDocuments(input: z.input<typeof fiscalListSchema>) {
  const query = fiscalListSchema.parse(input);
  const filter = {
    environment: query.environment,
    ...(query.type ? { type: query.type } : {}),
    ...(query.status ? { fiscalStatus: query.status } : {}),
    ...(query.search ? { $or: [{ sourceReference: query.search }, { encf: query.search }, { sourceId: query.search }] } : {}),
  };
  const rows = await FiscalInvoice.find(filter).select("type sourceReference encf transmission fiscalStatus lastErrorCode createdAt environment").sort({ createdAt: -1, _id: -1 }).skip((query.page - 1) * 25).limit(26).lean();
  return { page: query.page, hasNext: rows.length > 25, documents: rows.slice(0, 25).map(row => ({
    id: String(row._id), type: row.type, sourceReference: row.sourceReference, encf: row.encf ?? null,
    transmission: row.transmission, fiscalStatus: row.fiscalStatus, errorCode: row.lastErrorCode ?? null,
    createdAt: row.createdAt.toISOString(), environment: row.environment,
  })) };
}

export async function getFiscalTrace(id: string, afterVersion = -1) {
  if (!/^[a-f0-9]{24}$/i.test(id) || !Number.isSafeInteger(afterVersion) || afterVersion < -1) return null;
  const invoice = await FiscalInvoice.findById(id).select("type sourceReference encf transmission fiscalStatus snapshotHash version lastErrorCode createdAt environment").lean();
  if (!invoice) return null;
  const rows = await FiscalEvent.find({ invoiceId: id, version: { $gt: afterVersion } }).sort({ version: 1 }).limit(101).lean();
  return {
    invoice: { id, type: invoice.type, sourceReference: invoice.sourceReference, encf: invoice.encf ?? null, transmission: invoice.transmission,
      fiscalStatus: invoice.fiscalStatus, hash: invoice.snapshotHash, version: invoice.version, errorCode: invoice.lastErrorCode ?? null, environment: invoice.environment },
    events: rows.slice(0, 100).map(row => ({ version: row.version, action: row.action, actorId: row.actorId, code: row.code ?? null, occurredAt: row.occurredAt?.toISOString() })),
    nextAfterVersion: rows.length > 100 ? rows[99].version : null,
  };
}
