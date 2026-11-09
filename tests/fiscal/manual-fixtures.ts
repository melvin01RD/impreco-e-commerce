import type { PrepareCaseInput, OfficialCapture } from "../../lib/fiscal/manual/contracts";
import type { CommercialOrder } from "../../lib/fiscal/manual/snapshot";
export const manualOrder = (id = "000000000000000000000021"): CommercialOrder => ({
  _id: id, orderNumber: `SYNTH-${id.slice(-4)}`, status: "delivered", currency: "DOP",
  items: [{ name: "Artículo sintético", price: 100, quantity: 1 }], subtotal: 100, discount: 0, tax: 18, shippingCost: 0, total: 118,
});
export const manualInput = (id = "000000000000000000000021"): PrepareCaseInput => ({
  orderId: id, type: "E32", issuer: { taxId: "000000000", legalName: "Emisor sintético" }, buyer: {},
  classifications: [{ treatment: "taxable", rate: "18", classificationReference: "Clasificación sintética para pruebas" }],
});
export const manualCapture = (evidenceId: string, suffix = "0000000001"): OfficialCapture => ({
  type: "E32", encf: `E32${suffix}`, issuerTaxId: "000000000", buyer: {},
  currency: "DOP", base: "100.00", tax: "18.00", total: "118.00", issuedOn: "2026-01-01", status: "ACEPTADO",
  evidenceId, source: "FACTURADOR_GRATUITO_DGII", sourceReference: "Consulta oficial sintética para pruebas",
});
