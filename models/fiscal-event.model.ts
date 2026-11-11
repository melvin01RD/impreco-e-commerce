import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const schema = new Schema({
  invoiceId: { type: Schema.Types.ObjectId, ref: "FiscalInvoice", required: true, immutable: true },
  version: { type: Number, required: true, immutable: true, min: 0 },
  action: { type: String, enum: ["prepared", "queued", "sending", "result", "unknown", "reconciling", "credit_reserved"], required: true, immutable: true },
  actorId: { type: String, required: true, immutable: true, maxlength: 120 },
  code: { type: String, maxlength: 80, immutable: true },
  occurredAt: { type: Date, default: Date.now, immutable: true },
}, { strict: "throw" });
schema.index({ invoiceId: 1, version: 1 }, { unique: true });
schema.pre(["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace", "deleteOne", "deleteMany", "findOneAndDelete"], function () {
  throw new Error("FISCAL_EVENT_APPEND_ONLY");
});
schema.pre("save", function () { if (!this.isNew) throw new Error("FISCAL_EVENT_APPEND_ONLY"); });
schema.pre("deleteOne", { document: true, query: false }, function () { throw new Error("FISCAL_EVENT_APPEND_ONLY"); });
schema.pre("bulkWrite", function () { throw new Error("FISCAL_EVENT_APPEND_ONLY"); });
export type FiscalEventRecord = InferSchemaType<typeof schema>;
export const FiscalEvent: Model<FiscalEventRecord> = mongoose.models.FiscalEvent || mongoose.model("FiscalEvent", schema);
