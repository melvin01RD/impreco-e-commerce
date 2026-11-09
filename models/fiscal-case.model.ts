import mongoose, { Schema } from "mongoose";
import { MANUAL_TYPES, WORK_STATES, DGII_STATES } from "@/lib/fiscal/manual/contracts";

const caseSchema = new Schema({
  orderId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  orderReference: { type: String, required: true, immutable: true },
  issuerTaxId: { type: String, required: true, immutable: true },
  type: { type: String, enum: MANUAL_TYPES, required: true, immutable: true },
  snapshotJson: { type: String, required: true, immutable: true, select: false },
  snapshotHash: { type: String, required: true, immutable: true },
  inputHash: { type: String, required: true, immutable: true },
  originalCaseId: { type: Schema.Types.ObjectId, immutable: true },
  originalEncf: { type: String, immutable: true },
  adjustmentReason: { type: String, immutable: true },
  preparedBy: { type: String, required: true, immutable: true },
  state: { type: String, enum: WORK_STATES, default: "PENDIENTE_EMISION", required: true },
  officialStatus: { type: String, enum: DGII_STATES },
  // Canonical validated JSON; historical values are append-only events.
  captureJson: { type: String, select: false },
  encf: String, version: { type: Number, default: 0, required: true },
  capturedBy: String, capturedAt: Date, reviewedBy: String, reviewedAt: Date,
}, { timestamps: true, strict: "throw" });
caseSchema.index({ issuerTaxId: 1, orderId: 1 }, { unique: true });
caseSchema.index({ state: 1, createdAt: -1 });
caseSchema.pre(["updateOne", "updateMany", "findOneAndUpdate"], function () {
  const update = this.getUpdate();
  const mutable = new Set(["state", "officialStatus", "captureJson", "encf", "version", "capturedBy", "capturedAt", "reviewedBy", "reviewedAt", "updatedAt"]);
  if (!update || Array.isArray(update) || this.getOptions().upsert) throw new Error("FISCAL_CASE_IMMUTABLE");
  for (const [op, fields] of Object.entries(update)) {
    if (op === "$setOnInsert" && Object.keys(fields).every(k => k === "createdAt")) continue;
    if (!["$set", "$unset", "$inc"].includes(op) || Object.keys(fields).some(k => !mutable.has(k))) throw new Error("FISCAL_CASE_IMMUTABLE");
  }
});
caseSchema.pre("save", function () { if (!this.isNew) throw new Error("USE_FISCAL_CASE_COMMAND"); });
for (const method of ["replaceOne", "findOneAndReplace", "deleteOne", "deleteMany", "findOneAndDelete"] as const) caseSchema.pre(method, function () { throw new Error("FISCAL_CASE_APPEND_ONLY"); });
caseSchema.pre("bulkWrite", function () { throw new Error("FISCAL_CASE_APPEND_ONLY"); });
caseSchema.pre("deleteOne", { document: true, query: false }, function () { throw new Error("FISCAL_CASE_APPEND_ONLY"); });

const eventSchema = new Schema({
  caseId: { type: Schema.Types.ObjectId, required: true }, version: { type: Number, required: true },
  action: { type: String, required: true }, actorId: { type: String, required: true },
  requestId: { type: String, required: true }, requestHash: { type: String, required: true },
  detailJson: { type: String, required: true, select: false }, occurredAt: { type: Date, default: Date.now },
}, { strict: "throw" });
eventSchema.index({ caseId: 1, version: 1 }, { unique: true });
eventSchema.index({ caseId: 1, requestId: 1 }, { unique: true });
const claimSchema = new Schema({
  issuerTaxId: { type: String, required: true }, encf: { type: String, required: true },
  caseId: { type: Schema.Types.ObjectId, required: true }, claimedAt: { type: Date, default: Date.now },
}, { strict: "throw" });
// No environment partition: an official e-NCF remains reserved even after a capture correction.
claimSchema.index({ issuerTaxId: 1, encf: 1 }, { unique: true });
const evidenceSchema = new Schema({
  caseId: { type: Schema.Types.ObjectId, required: true }, key: { type: String, required: true, select: false },
  mime: { type: String, required: true }, size: { type: Number, required: true }, sha256: { type: String, required: true },
  source: { type: String, enum: ["FACTURADOR_GRATUITO_DGII"], required: true }, sourceReference: { type: String, required: true },
  actorId: { type: String, required: true }, createdAt: { type: Date, default: Date.now },
}, { strict: "throw" });
evidenceSchema.index({ caseId: 1, createdAt: 1 });
for (const schema of [eventSchema, claimSchema, evidenceSchema]) {
  schema.pre("save", function () { if (!this.isNew) throw new Error("FISCAL_HISTORY_APPEND_ONLY"); });
  for (const method of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace", "deleteOne", "deleteMany", "findOneAndDelete"] as const) schema.pre(method, function () { throw new Error("FISCAL_HISTORY_APPEND_ONLY"); });
  schema.pre("bulkWrite", function () { throw new Error("FISCAL_HISTORY_APPEND_ONLY"); });
  schema.pre("deleteOne", { document: true, query: false }, function () { throw new Error("FISCAL_HISTORY_APPEND_ONLY"); });
}
export const FiscalCase = mongoose.models.FiscalCase as mongoose.Model<mongoose.InferSchemaType<typeof caseSchema>> || mongoose.model("FiscalCase", caseSchema);
export const FiscalCaseEvent = mongoose.models.FiscalCaseEvent as mongoose.Model<mongoose.InferSchemaType<typeof eventSchema>> || mongoose.model("FiscalCaseEvent", eventSchema);
export const FiscalOfficialClaim = mongoose.models.FiscalOfficialClaim as mongoose.Model<mongoose.InferSchemaType<typeof claimSchema>> || mongoose.model("FiscalOfficialClaim", claimSchema);
export const FiscalEvidence = mongoose.models.FiscalEvidence as mongoose.Model<mongoose.InferSchemaType<typeof evidenceSchema>> || mongoose.model("FiscalEvidence", evidenceSchema);
