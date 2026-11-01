import { FiscalError } from "./fiscal-errors";
import type { FiscalSnapshot } from "./snapshot";
import { calculateFiscalTotals, decimalUnits } from "./tax-calculator";

/** Structural buyer checks only; active RNC validation still requires an authorized source. */
export function validateSalesBuyer(type: "E31" | "E32", totalDop: string, buyer: FiscalSnapshot["buyer"]) {
  if (buyer.taxId && !/^(\d{9}|\d{11})$/.test(buyer.taxId)) throw new FiscalError("INVALID_BUYER");
  if (buyer.foreignId && (buyer.taxId || buyer.foreignId.length > 20 || !buyer.foreignId.trim())) throw new FiscalError("INVALID_BUYER");
  const total = decimalUnits(totalDop);
  const threshold = BigInt(25000000);
  if (type === "E31" || total >= threshold) {
    if (!buyer.legalName?.trim() || buyer.legalName.length > 150) throw new FiscalError("INVALID_BUYER");
    if (!buyer.taxId && !(type === "E32" && total > threshold && buyer.foreignId)) throw new FiscalError("INVALID_BUYER");
  }
  if (type === "E31" && buyer.foreignId) throw new FiscalError("INVALID_BUYER");
}

export function validateSnapshotAmounts(snapshot: FiscalSnapshot) {
  const calculated = calculateFiscalTotals(snapshot.lines);
  for (let index = 0; index < snapshot.lines.length; index++) {
    for (const key of ["base", "tax", "total"] as const) {
      if (calculated.lines[index][key] !== snapshot.lines[index][key]) throw new FiscalError("TOTALS_MISMATCH");
    }
  }
  for (const key of ["base", "tax", "total", "nonBillable"] as const) {
    if (calculated.totals[key] !== snapshot.totals[key]) throw new FiscalError("TOTALS_MISMATCH");
  }
  if (snapshot.type === "E31" || snapshot.type === "E32") validateSalesBuyer(snapshot.type, snapshot.totals.total, snapshot.buyer);
}
