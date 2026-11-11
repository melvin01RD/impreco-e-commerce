import { createHash } from "node:crypto";
import { prepareCaseSchema, type PrepareCaseInput, type OfficialCapture } from "./contracts";
import { serializeSnapshot, type FiscalSnapshot } from "../core/snapshot";
import { allocateDiscount, calculateFiscalTotals, decimalUnits, formatMoney } from "../core/tax-calculator";
import { validateSnapshotAmounts, validateSalesBuyer } from "../core/fiscal-validator";

export interface CommercialOrder {
  _id: unknown; orderNumber: string; currency?: string; status: string;
  items: { name: string; price: number; quantity: number }[];
  subtotal: number; discount?: number; tax?: number; shippingCost?: number; total: number;
  customs?: { dutyAmount?: number; collectedAtCheckout?: boolean };
}
// Order prices are persisted as Numbers. Refuse precision loss instead of silently rounding.
export function orderMoney(value: number | undefined): string {
  const number = value ?? 0;
  if (!Number.isFinite(number) || number < 0 || !Number.isSafeInteger(Math.round(number * 100)) || Math.abs(number * 100 - Math.round(number * 100)) > 0.000001) throw new Error("IMPORTE_COMERCIAL_INVALIDO");
  return formatMoney(BigInt(Math.round(number * 100)));
}
export function buildOrderSnapshot(order: CommercialOrder, input: PrepareCaseInput) {
  const data = prepareCaseSchema.parse(input);
  if (String(order._id) !== data.orderId || order.currency !== "DOP" || order.status === "cancelled" || order.items.length !== data.classifications.length) throw new Error("PEDIDO_NO_COMPATIBLE");
  if (order.customs?.collectedAtCheckout && order.customs.dutyAmount) throw new Error("ADUANA_REQUIERE_MAPEO_FISCAL");
  const gross = order.items.map((item, i) => calculateFiscalTotals([{ id: String(i), quantity: String(item.quantity), unitPrice: orderMoney(item.price), discount: "0.00", treatment: "exempt", rate: "0", priceIncludesTax: false }]).totals.total);
  if (gross.reduce((sum, amount) => sum + decimalUnits(amount), BigInt(0)) !== decimalUnits(orderMoney(order.subtotal))) throw new Error("SUBTOTAL_NO_COINCIDE");
  const discounts = allocateDiscount(orderMoney(order.discount), gross);
  const inputs = order.items.map((item, i) => ({ id: `item-${i}`, description: item.name, quantity: String(item.quantity), unitPrice: orderMoney(item.price), discount: discounts[i], priceIncludesTax: false, ...data.classifications[i] }));
  if (order.shippingCost) {
    if (!data.shippingClassification) throw new Error("CLASIFICACION_ENVIO_REQUERIDA");
    inputs.push({ id: "shipping", description: "Transporte del pedido", quantity: "1", unitPrice: orderMoney(order.shippingCost), discount: "0.00", priceIncludesTax: false, ...data.shippingClassification });
  }
  const calculated = calculateFiscalTotals(inputs);
  if (calculated.totals.tax !== orderMoney(order.tax) || calculated.totals.total !== orderMoney(order.total)) throw new Error("MONTOS_NO_COINCIDEN_CON_PEDIDO");
  const serialized = serializeSnapshot({ version: 1, type: data.type,
    source: { kind: data.type === "E33" ? "adjustment" : "order", id: data.orderId, reference: order.orderNumber },
    issuer: data.issuer, buyer: data.buyer, currency: order.currency,
    lines: calculated.lines.map((line, i) => ({ ...line, description: inputs[i].description, classificationReference: inputs[i].classificationReference })),
    totals: calculated.totals, ruleVersion: "IMP-FE-015-manual-v1", ...(data.originalCaseId ? { originalId: data.originalCaseId } : {}),
  });
  validateSnapshotAmounts(serialized.snapshot);
  if (data.type === "E33") validateSalesBuyer("E31", calculated.totals.total, data.buyer);
  return { ...serialized, inputHash: createHash("sha256").update(JSON.stringify(data)).digest("hex") };
}
export function captureMatches(snapshot: FiscalSnapshot, capture: OfficialCapture) {
  return capture.type === snapshot.type && capture.issuerTaxId === snapshot.issuer.taxId && capture.currency === snapshot.currency
    && ["taxId", "foreignId", "legalName"].every(key => (capture.buyer[key as keyof typeof capture.buyer] ?? "") === (snapshot.buyer[key as keyof typeof snapshot.buyer] ?? ""))
    && capture.base === snapshot.totals.base && capture.tax === snapshot.totals.tax && capture.total === snapshot.totals.total;
}
export function reconciledState(status: OfficialCapture["status"], matches: boolean) {
  if (!matches || status === "RECHAZADO") return "REQUIERE_CORRECCION";
  if (status === "EN_PROCESO") return "PENDIENTE_VERIFICACION";
  return "CONCILIADO";
}
