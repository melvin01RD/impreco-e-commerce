import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOrderInvoiceData, type OrderInvoiceSource } from "../../lib/orders/order-invoice";

test("paid commercial invoice keeps order number and does not claim fiscal validity", () => {
  const order = {
    orderNumber: "ORDER-TEST", paymentStatus: "paid", createdAt: "2026-11-01T12:00:00Z",
    shippingAddress: { fullName: "Test", street: "Test", city: "Test", country: "DO" },
    items: [{ name: "Synthetic", price: 100, quantity: 1 }], subtotal: 100, tax: 18,
    shippingCost: 0, discount: 0, total: 118,
  } as unknown as OrderInvoiceSource;
  const data = buildOrderInvoiceData(order, {});
  assert.equal(data.invoiceNumber, "ORDER-TEST");
  assert.equal(data.invoiceNumberLabel, "Order number");
  assert.equal(data.documentLabel, "Commercial invoice");
  assert.equal(data.status, "Paid");
  assert.match(data.notes!, /No es un comprobante fiscal/);
  assert.equal(data.total, 118);
});
