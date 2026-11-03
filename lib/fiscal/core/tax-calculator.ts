import { FiscalError } from "./fiscal-errors";

const ZERO = BigInt(0), ONE = BigInt(1), HUNDRED = BigInt(100);

/** Exact nonnegative decimal parser. No Number conversion or implicit rounding. */
export function decimalUnits(value: string, scale = 2): bigint {
  if (typeof value !== "string" || value.length > 32 || !/^(0|[1-9]\d*)(\.\d+)?$/.test(value)) {
    throw new FiscalError("INVALID_AMOUNT");
  }
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > scale || whole.length > 14) throw new FiscalError("INVALID_AMOUNT");
  return BigInt(whole + fraction.padEnd(scale, "0"));
}

export function formatMoney(value: bigint): string {
  if (value < ZERO) throw new FiscalError("INVALID_AMOUNT");
  const digits = value.toString().padStart(3, "0");
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

function halfUp(numerator: bigint, denominator: bigint) {
  const quotient = numerator / denominator;
  return quotient + (numerator % denominator * BigInt(2) >= denominator ? ONE : ZERO);
}

export type TaxLineInput = {
  id: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  treatment: "taxable" | "exempt" | "non_billable";
  /** Percentage supplied by an approved classification, never guessed from product name. */
  rate: string;
  priceIncludesTax: boolean;
};

/** DOP calculation primitive. Policy approval and product classification remain external. */
export function calculateFiscalTotals(input: readonly TaxLineInput[]) {
  if (!input.length || input.length > 1000 || new Set(input.map(line => line.id)).size !== input.length) {
    throw new FiscalError("INVALID_AMOUNT");
  }
  let baseTotal = ZERO, taxTotal = ZERO, total = ZERO, nonBillable = ZERO;
  const lines = input.map(line => {
    const quantity = decimalUnits(line.quantity, 4);
    const unitPrice = decimalUnits(line.unitPrice, 4);
    const discount = decimalUnits(line.discount);
    const rate = decimalUnits(line.rate, 4);
    if (quantity <= ZERO || rate > BigInt(1000000) ||
        !["taxable", "exempt", "non_billable"].includes(line.treatment) ||
        (line.treatment !== "taxable" && rate !== ZERO)) throw new FiscalError("INVALID_AMOUNT");
    const gross = halfUp(quantity * unitPrice, BigInt(1000000));
    if (discount > gross) throw new FiscalError("INVALID_AMOUNT");
    const net = gross - discount;
    const rateScale = HUNDRED * BigInt(10000);
    const base = line.priceIncludesTax ? halfUp(net * rateScale, rateScale + rate) : net;
    const tax = line.priceIncludesTax ? net - base : halfUp(base * rate, rateScale);
    const lineTotal = base + tax;
    if (line.treatment === "non_billable") nonBillable += lineTotal;
    else { baseTotal += base; taxTotal += tax; total += lineTotal; }
    return { ...line, base: formatMoney(base), tax: formatMoney(tax), total: formatMoney(lineTotal) };
  });
  return { lines, totals: { base: formatMoney(baseTotal), tax: formatMoney(taxTotal), total: formatMoney(total), nonBillable: formatMoney(nonBillable) } };
}

/** Proportional allocation with deterministic largest-remainder rounding. */
export function allocateDiscount(amount: string, weights: readonly string[]): string[] {
  const target = decimalUnits(amount);
  const values = weights.map(value => decimalUnits(value));
  const total = values.reduce((a, b) => a + b, ZERO);
  if (target > total || !values.length) throw new FiscalError("INVALID_AMOUNT");
  if (total === ZERO) return values.map(() => "0.00");
  const shares = values.map(value => target * value / total);
  let remaining = target - shares.reduce((a, b) => a + b, ZERO);
  const order = values.map((value, index) => ({ index, remainder: target * value % total }))
    .sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const { index } of order) { if (remaining === ZERO) break; shares[index] += ONE; remaining -= ONE; }
  return shares.map(formatMoney);
}

export function assertCommercialTotal(commercialTotal: string, fiscal: { total: string; nonBillable: string }) {
  if (decimalUnits(commercialTotal) !== decimalUnits(fiscal.total) + decimalUnits(fiscal.nonBillable)) {
    throw new FiscalError("TOTALS_MISMATCH");
  }
}
