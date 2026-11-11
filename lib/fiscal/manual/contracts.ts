import * as z from "zod";
import { partySchema, moneySchema } from "../core/party";

export const WORK_STATES = ["PENDIENTE_EMISION", "PENDIENTE_VERIFICACION", "CONCILIADO", "REQUIERE_CORRECCION"] as const;
export const DGII_STATES = ["ACEPTADO", "ACEPTADO_CONDICIONAL", "EN_PROCESO", "RECHAZADO"] as const;
export const MANUAL_TYPES = ["E31", "E32", "E33"] as const;
export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
export const classificationSchema = z.object({
  treatment: z.enum(["taxable", "exempt"]), rate: z.string().regex(/^(0|[1-9]\d?)(\.\d{1,4})?$/),
  classificationReference: z.string().trim().min(3).max(200),
}).strict();
export const prepareCaseSchema = z.object({
  orderId: objectIdSchema, type: z.enum(MANUAL_TYPES),
  issuer: partySchema.extend({ taxId: z.string().regex(/^(\d{9}|\d{11})$/), legalName: z.string().trim().min(1).max(150) }),
  buyer: partySchema,
  classifications: z.array(classificationSchema).min(1).max(1000),
  shippingClassification: classificationSchema.optional(),
  originalCaseId: objectIdSchema.optional(), adjustmentReason: z.string().trim().min(10).max(500).optional(),
}).strict().superRefine((v, ctx) => {
  if ((v.type === "E33") !== Boolean(v.originalCaseId && v.adjustmentReason)) ctx.addIssue({ code: "custom", message: "E33 exige expediente original y motivo del ajuste comercial" });
  if (v.type !== "E33" && (v.originalCaseId || v.adjustmentReason)) ctx.addIssue({ code: "custom", message: "Referencia de ajuste no aplicable" });
});
export const officialSchema = z.object({
  type: z.enum(MANUAL_TYPES), encf: z.string().regex(/^E(31|32|33)\d{10}$/),
  issuerTaxId: z.string().regex(/^(\d{9}|\d{11})$/), buyer: partySchema,
  issuedOn: z.iso.date(), status: z.enum(DGII_STATES), currency: z.literal("DOP"),
  base: moneySchema, tax: moneySchema, total: moneySchema,
  originalEncf: z.string().regex(/^E(31|32)\d{10}$/).optional(),
  evidenceId: objectIdSchema,
  source: z.literal("FACTURADOR_GRATUITO_DGII"),
  sourceReference: z.string().trim().min(5).max(300),
}).strict().superRefine((v, ctx) => {
  if (!v.encf.startsWith(v.type)) ctx.addIssue({ code: "custom", message: "Tipo y e-NCF no coinciden" });
  if (v.issuedOn > new Date().toISOString().slice(0, 10)) ctx.addIssue({ code: "custom", message: "Fecha futura" });
  if ((v.type === "E33") !== Boolean(v.originalEncf)) ctx.addIssue({ code: "custom", message: "E33 requiere comprobante original" });
});
const commandBase = { expectedVersion: z.number().int().min(0), requestId: z.string().uuid(), reason: z.string().trim().min(10).max(500) };
export const caseCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...commandBase, action: z.literal("register"), official: officialSchema }).strict(),
  z.object({ ...commandBase, action: z.literal("verify"), evidenceId: objectIdSchema, status: z.enum(DGII_STATES), checkedOfficialSource: z.literal(true), sourceReference: z.string().trim().min(5).max(300) }).strict(),
  z.object({ ...commandBase, action: z.literal("correction") }).strict(),
]);
export type PrepareCaseInput = z.infer<typeof prepareCaseSchema>;
export type OfficialCapture = z.infer<typeof officialSchema>;
export type CaseCommand = z.infer<typeof caseCommandSchema>;
export const evidenceMetadataSchema = z.object({ source: z.literal("FACTURADOR_GRATUITO_DGII"), sourceReference: z.string().trim().min(5).max(300) }).strict();
export const EVIDENCE_LIMIT = 4 * 1024 * 1024;
export const EVIDENCE_PREFIX = "fiscal-evidence/";

export function evidenceType(bytes: Uint8Array, declared: string) {
  const signature = Buffer.from(bytes.subarray(0, 8));
  if (declared === "application/pdf" && signature.subarray(0, 5).toString() === "%PDF-") return "pdf";
  if (declared === "image/png" && signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (declared === "image/jpeg" && signature[0] === 255 && signature[1] === 216 && signature[2] === 255) return "jpg";
  throw new Error("EVIDENCIA_TIPO_INVALIDO");
}
