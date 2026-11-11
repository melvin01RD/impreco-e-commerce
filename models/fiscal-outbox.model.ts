import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const schema = new Schema({
  invoiceId: { type: Schema.Types.ObjectId, ref: "FiscalInvoice", required: true, immutable: true },
  status: { type: String, enum: ["pending", "processing", "done", "unknown", "blocked"], default: "blocked", required: true },
  attempts: { type: Number, default: 0, min: 0 },
  leaseToken: String,
  leaseUntil: Date,
  nextAttemptAt: Date,
  lastErrorCode: { type: String, maxlength: 80 },
}, { timestamps: true, strict: "throw" });
schema.index({ invoiceId: 1 }, { unique: true });
schema.index({ status: 1, nextAttemptAt: 1 });
// No TTL: fiscal evidence must not disappear with a messaging queue's retention.
export type FiscalOutboxRecord = InferSchemaType<typeof schema>;
export const FiscalOutbox: Model<FiscalOutboxRecord> = mongoose.models.FiscalOutbox || mongoose.model("FiscalOutbox", schema);
