import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateDiscount, assertCommercialTotal, calculateFiscalTotals, decimalUnits, type TaxLineInput } from "../../lib/fiscal/core/tax-calculator";
import { calculateCheckoutTotals } from "../../lib/catalog/discounts";

const line: TaxLineInput = { id: "goods", quantity: "1", unitPrice: "100.00", discount: "0.00", treatment: "taxable", rate: "18", priceIncludesTax: false };

test("mixed supplied rates, exemptions, non-billable lines and transport reconcile", () => {
  const result = calculateFiscalTotals([
    line, { ...line, id: "reduced", rate: "16" },
    { ...line, id: "exempt", rate: "0", treatment: "exempt" },
    { ...line, id: "excluded", rate: "0", treatment: "non_billable" },
    { ...line, id: "transport", unitPrice: "10.00" },
  ]);
  assert.deepEqual(result.totals, { base: "310.00", tax: "35.80", total: "345.80", nonBillable: "100.00" });
  assertCommercialTotal("445.80", result.totals);
  assert.throws(() => assertCommercialTotal("445.79", result.totals), /TOTALS_MISMATCH/);
});

test("included tax, fractional quantities, discounts and half-cent rounding are exact", () => {
  assert.equal(calculateFiscalTotals([{ ...line, unitPrice: "118", priceIncludesTax: true }]).lines[0].base, "100.00");
  assert.equal(calculateFiscalTotals([{ ...line, quantity: "0.5", unitPrice: "0.01", rate: "0" }]).totals.total, "0.01");
  assert.equal(calculateFiscalTotals([{ ...line, discount: "10.00" }]).totals.total, "106.20");
  assert.deepEqual(allocateDiscount("0.02", ["1", "1", "1"]), ["0.01", "0.01", "0.00"]);
});

test("invalid amounts and silently rounded inputs are refused", () => {
  for (const value of ["NaN", "Infinity", "-1", "1e3", "0.001", "01.00"]) assert.throws(() => decimalUnits(value), /INVALID_AMOUNT/);
  assert.throws(() => calculateFiscalTotals([{ ...line, discount: "100.01" }]), /INVALID_AMOUNT/);
  assert.throws(() => calculateFiscalTotals([{ ...line, treatment: "exempt" }]), /INVALID_AMOUNT/);
  assert.throws(() => calculateFiscalTotals([{ ...line, quantity: "0" }]), /INVALID_AMOUNT/);
});

test("existing commercial coupon and shipping totals remain unchanged", () => {
  const result = calculateCheckoutTotals({ subtotal: 100, shippingCost: 10, taxRate: 0.18, coupon: { type: "fixed", discount: 10 }, currency: "DOP" });
  assert.equal(result.tax, 16.2);
  assert.equal(result.total, 116.2);
  const fiscal = calculateFiscalTotals([{ ...line, discount: "10.00" }, { ...line, id: "shipping", unitPrice: "10", rate: "0", treatment: "exempt" }]);
  assertCommercialTotal(result.total.toFixed(2), fiscal.totals);
  const shipping = calculateCheckoutTotals({ subtotal: 100, shippingCost: 10, taxRate: 0.18, coupon: { type: "free_shipping" }, currency: "DOP" });
  assert.equal(shipping.total, 118);
});
