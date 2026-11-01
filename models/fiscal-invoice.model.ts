import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { DOCUMENT_TYPES, SOURCE_KINDS } from "@/lib/fiscal/core/document-types";

export const TRANSMISSION_STATES = ["prepared", "queued", "sending", "delivered", "unknown", "reconciling"] as const;
export const FISCAL_STATES = ["unverified", "pending", "accepted", "conditionally_accepted", "rejected"] as const;

const schema = new Schema({
  environment: { type: String, enum: ["sandbox", "production"], required: true, immutable: true },
  issuerTaxId: { type: String, required: true, immutable: true },
  type: { type: String, enum: DOCUMENT_TYPES, required: true, immutable: true },
  sourceKind: { type: String, enum: SOURCE_KINDS, required: true, immutable: true },
  sourceId: { type: String, required: true, immutable: true },
  sourceReference: { type: String, required: true, immutable: true },
  // One business operation, independent of an HTTP caller's retry key.
  operationKey: { type: String, required: true, immutable: true, maxlength: 200 },
  snapshotJson: { type: String, required: true, immutable: true, select: false },
  snapshotHash: { type: String, required: true, immutable: true, match: /^[a-f0-9]{64}$/ },
  originalId: { type: Schema.Types.ObjectId, ref: "FiscalInvoice", immutable: true },
  transmission: { type: String, enum: TRANSMISSION_STATES, default: "prepared", required: true },
  fiscalStatus: { type: String, enum: FISCAL_STATES, default: "unverified", required: true },
  encf: { type: String, match: /^E(31|32|33|34|41|43|45)\d{10}$/ },
  providerId: { type: String, maxlength: 200 },
  version: { type: Number, default: 0, required: true, min: 0 },
  // Integer minor units within Number.MAX_SAFE_INTEGER, only for atomic reservations.
  creditReservedMinor: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
  lastErrorCode: { type: String, maxlength: 80 },
  verifiedAt: Date,
  // Private storage keys only. Never store signed URLs or provider credentials.
  xmlObjectKey: { type: String, select: false, maxlength: 500 },
  printObjectKey: { type: String, select: false, maxlength: 500 },
}, { timestamps: true, strict: "throw", optimisticConcurrency: true });

schema.index({ environment: 1, issuerTaxId: 1, operationKey: 1 }, { unique: true });
schema.index({ environment: 1, issuerTaxId: 1, encf: 1 }, { unique: true, partialFilterExpression: { encf: { $type: "string" } } });
schema.index({ sourceKind: 1, sourceId: 1, createdAt: -1 });
schema.index({ type: 1, fiscalStatus: 1, createdAt: -1 });
schema.index({ originalId: 1 });
schema.pre(["updateOne", "updateMany", "findOneAndUpdate"], function () {
  const update = this.getUpdate();
  const mutable = new Set(["transmission", "fiscalStatus", "encf", "providerId", "version", "creditReservedMinor", "lastErrorCode", "verifiedAt", "xmlObjectKey", "printObjectKey", "updatedAt"]);
  if (!update || Array.isArray(update)) throw new Error("FISCAL_IMMUTABLE_UPDATE");
  for (const [operator, fields] of Object.entries(update)) {
    // Mongoose timestamps injects createdAt into $setOnInsert even for non-upserts.
    if (operator === "$setOnInsert" && !this.getOptions().upsert && Object.keys(fields).every(key => key === "createdAt")) continue;
    if (!["$set", "$unset", "$inc"].includes(operator) || Object.keys(fields).some(key => !mutable.has(key))) {
      throw new Error("FISCAL_IMMUTABLE_UPDATE");
    }
  }
  if (this.getOptions().upsert) throw new Error("FISCAL_IMMUTABLE_UPDATE");
});
// Replacement bypasses Mongoose immutable paths. No replacement or deletion is allowed.
schema.pre(["replaceOne", "findOneAndReplace", "deleteOne", "deleteMany", "findOneAndDelete"], function () {
  throw new Error("FISCAL_DOCUMENT_APPEND_ONLY");
});
schema.pre("deleteOne", { document: true, query: false }, function () {
  throw new Error("FISCAL_DOCUMENT_APPEND_ONLY");
});
schema.pre("bulkWrite", function () { throw new Error("FISCAL_BULK_WRITE_FORBIDDEN"); });

export type FiscalInvoiceRecord = InferSchemaType<typeof schema>;
export const FiscalInvoice: Model<FiscalInvoiceRecord> = mongoose.models.FiscalInvoice || mongoose.model("FiscalInvoice", schema);
