import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { DOCUMENT_TYPES } from "@/lib/fiscal/core/document-types";

const schema = new Schema({
  environment: { type: String, enum: ["sandbox", "production"], required: true },
  issuerTaxId: { type: String, required: true },
  enabled: { type: Boolean, default: false },
  enabledTypes: { type: [String], enum: DOCUMENT_TYPES, default: [] },
  ruleVersion: { type: String, maxlength: 100 },
  contractVersion: { type: String, maxlength: 100 },
  authorizationReference: { type: String, maxlength: 200 },
  reviewedBy: { type: String, maxlength: 120 },
  reviewedAt: Date,
}, { timestamps: true, strict: "throw" });
schema.index({ environment: 1, issuerTaxId: 1 }, { unique: true });
export type FiscalSettingsRecord = InferSchemaType<typeof schema>;
export const FiscalSettings: Model<FiscalSettingsRecord> = mongoose.models.FiscalSettings || mongoose.model("FiscalSettings", schema);
