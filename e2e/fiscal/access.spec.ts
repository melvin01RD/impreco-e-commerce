import { test, expect } from "@playwright/test";
import { origin, orderId, orderReference, email, password } from "./fixtures";

test("anonymous callers cannot read fiscal documents, capabilities or trace", async ({ request }) => {
  for (const route of ["/api/admin/fiscal", "/api/admin/fiscal/capabilities", "/api/admin/fiscal/000000000000000000000001"]) {
    const response = await request.get(route);
    expect(response.status()).toBe(401);
    expect(await response.text()).not.toContain("snapshotJson");
  }
});

test("GET routes do not expose a fiscal write method", async ({ request }) => {
  const response = await request.post("/api/admin/fiscal", { data: { type: "E31" } });
  expect(response.status()).toBe(405);
});

test("order invoice remains protected independently of fiscal module", async ({ request }) => {
  const response = await request.get("/api/orders/000000000000000000000001/invoice");
  expect(response.status()).toBe(401);
});

test("authenticated customer cannot access the fiscal administration", async ({ request }) => {
  const login = await request.post("/api/auth/sign-in/email", { headers: { Origin: origin }, data: { email: email("customer"), password: password() } });
  expect(login.status()).toBe(200);
  expect((await request.get("/api/admin/fiscal")).status()).toBe(403);
  expect((await request.get("/api/admin/fiscal/capabilities")).status()).toBe(403);
});

test("administrator sees disabled capabilities, validates filters and can open the fiscal page", async ({ request }) => {
  const login = await request.post("/api/auth/sign-in/email", { headers: { Origin: origin }, data: { email: email("admin"), password: password() } });
  expect(login.status()).toBe(200);
  const capabilities = await request.get("/api/admin/fiscal/capabilities");
  expect(capabilities.status()).toBe(200);
  const body = await capabilities.json();
  expect(body.data.issuanceEnabled).toBe(false);
  expect(body.data.types).toHaveLength(7);
  const list = await request.get(`/api/admin/fiscal?type=E32&search=${orderReference("11")}`);
  expect(list.status()).toBe(200);
  expect((await list.json()).data.documents).toEqual([]);
  expect((await request.get("/api/admin/fiscal?type=E44")).status()).toBe(400);
  const page = await request.get("/admin/fiscal");
  expect(page.status()).toBe(200);
  expect(await page.text()).toContain("Facturación electrónica DGII");
});

test("commercial PDF can be downloaded repeatedly without creating a fiscal invoice", async ({ request }) => {
  const login = await request.post("/api/auth/sign-in/email", { headers: { Origin: origin }, data: { email: email("admin"), password: password() } });
  expect(login.status()).toBe(200);
  for (let attempt = 0; attempt < 2; attempt++) {
    const pdf = await request.get(`/api/admin/orders/${orderId("11")}/invoice`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    const buffer = await pdf.body();
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(buffer.length).toBeGreaterThan(1000);
  }
  const documents = await request.get(`/api/admin/fiscal?search=${orderReference("11")}`);
  expect((await documents.json()).data.documents).toEqual([]);
});
