import type { FiscalSnapshot } from "../../lib/fiscal/core/snapshot";

/** Synthetic data. Never sent to a provider. */
export function fixture(): FiscalSnapshot {
  return {
    version: 1, type: "E32", source: { kind: "order", id: "synthetic-order", reference: "TEST-001" },
    issuer: { taxId: "000000000", legalName: "SYNTHETIC TEST ONLY" }, buyer: {}, currency: "DOP",
    lines: [{ id: "1", description: "Synthetic line", quantity: "1", unitPrice: "100.00", treatment: "taxable", rate: "18", priceIncludesTax: false, discount: "0.00", base: "100.00", tax: "18.00", total: "118.00", classificationReference: "test-only" }],
    totals: { base: "100.00", tax: "18.00", total: "118.00", nonBillable: "0.00" }, ruleVersion: "test-only",
  };
}
