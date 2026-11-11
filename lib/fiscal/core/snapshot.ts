import { createHash } from "node:crypto";
import * as z from "zod";
import { DOCUMENT_TYPES, SOURCE_KINDS, assertDocumentOrigin } from "./document-types";

import { moneySchema, partySchema } from "./party";
export { moneySchema, partySchema } from "./party";

/** Internal domain contract, NOT a Medasoft payload. Amounts are decimal strings. */
export const fiscalSnapshotSchema = z.object({
  version: z.literal(1),
  type: z.enum(DOCUMENT_TYPES),
  source: z.object({ kind: z.enum(SOURCE_KINDS), id: z.string().min(1).max(120), reference: z.string().max(120) }).strict(),
  issuer: partySchema.extend({ taxId: z.string().regex(/^(\d{9}|\d{11})$/), legalName: z.string().trim().min(1).max(150) }),
  buyer: partySchema,
  currency: z.literal("DOP"),
  lines: z.array(z.object({
    id: z.string().min(1).max(120), description: z.string().min(1).max(200),
    quantity: z.string().regex(/^(0|[1-9]\d{0,9})(\.\d{1,4})?$/),
    unitPrice: z.string().regex(/^(0|[1-9]\d{0,13})(\.\d{1,4})?$/),
    treatment: z.enum(["taxable", "exempt", "non_billable"]),
    rate: z.string().regex(/^(0|[1-9]\d?)(\.\d{1,4})?$/),
    priceIncludesTax: z.boolean(), discount: moneySchema,
    base: moneySchema, tax: moneySchema, total: moneySchema,
    classificationReference: z.string().min(1).max(200),
  }).strict()).min(1).max(1000),
  totals: z.object({ base: moneySchema, tax: moneySchema, total: moneySchema, nonBillable: moneySchema }).strict(),
  originalId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  ruleVersion: z.string().min(1).max(100),
}).strict().superRefine((value, ctx) => {
  try { assertDocumentOrigin(value.type, value.source.kind, value.originalId); }
  catch { ctx.addIssue({ code: "custom", message: "INVALID_ORIGIN" }); }
  if (new Set(value.lines.map(line => line.id)).size !== value.lines.length) {
    ctx.addIssue({ code: "custom", message: "DUPLICATE_LINE" });
  }
});

export type FiscalSnapshot = z.infer<typeof fiscalSnapshotSchema>;

/** Schema parsing fixes property order and strips no unknown input (strict schemas). */
export function serializeSnapshot(input: unknown) {
  const snapshot = fiscalSnapshotSchema.parse(input);
  const json = JSON.stringify(snapshot);
  return { snapshot, json, hash: createHash("sha256").update(json).digest("hex") };
}
