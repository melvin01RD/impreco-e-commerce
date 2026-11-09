import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { manualInput, manualCapture } from "../../tests/fiscal/manual-fixtures";
import { origin, orderId, email, password, sequence } from "./fixtures";
const headers = { Origin: origin };
async function login(request: APIRequestContext, role: "admin" | "customer") {
  const response = await request.post("/api/auth/sign-in/email", { headers, data: { email: email(role), password: password() } });
  expect(response.status()).toBe(200);
}

test("manual API: authentication, role and CSRF checks cover all mutations and private evidence", async ({ request }) => {
  const id = orderId("41");
  for (const route of ["/api/admin/fiscal/cases", `/api/admin/fiscal/cases/${id}`, `/api/admin/fiscal/cases/${id}/evidence`]) {
    expect((await request.post(route, { headers, data: {} })).status()).toBe(401);
  }
  await login(request, "customer");
  for (const route of ["/api/admin/fiscal/cases", `/api/admin/fiscal/cases/${id}`, `/api/admin/fiscal/cases/${id}/evidence`]) {
    expect((await request.post(route, { headers, data: {} })).status()).toBe(403);
  }
  expect((await request.get(`/api/admin/fiscal/cases/${id}/evidence/${id}`)).status()).toBe(403);
  await login(request, "admin");
  expect((await request.post("/api/admin/fiscal/cases", { headers: { Origin: "https://untrusted.invalid" }, data: manualInput(id) })).status()).toBe(403);
  expect((await request.post("/api/admin/fiscal/cases", { headers, data: { ...manualInput(id), snapshot: {} } })).status()).toBe(400);
});

test("manual API: evidence ownership, input validation, replay, concurrent versions and duplicate e-NCF", async ({ request }) => {
  await login(request, "admin");
  const create = async (order: string) => {
    const response = await request.post("/api/admin/fiscal/cases", { headers, data: manualInput(order) });
    expect(response.status()).toBe(200); return (await response.json()).data.id as string;
  };
  const id = await create(orderId("42"));
  const other = await create(orderId("43"));
  expect(await create(orderId("42"))).toBe(id);
  const upload = async (caseId: string) => {
    const response = await request.post(`/api/admin/fiscal/cases/${caseId}/evidence`, { headers: { ...headers, "Content-Type": "application/pdf", "x-fiscal-source-reference": "Synthetic-official-test" }, data: Buffer.from("%PDF-1.7\nSynthetic official test evidence\n%%EOF") });
    expect(response.status()).toBe(200); return (await response.json()).data.id as string;
  };
  const evidence = await upload(id); const foreignEvidence = await upload(other);
  const url = `/api/admin/fiscal/cases/${id}`;
  expect((await request.post(`${url}/evidence`, { headers: { ...headers, "Content-Type": "application/pdf", "x-fiscal-source-reference": "Synthetic-official-test" }, data: Buffer.from("<html>not a PDF") })).status()).toBe(400);
  expect((await request.post(`${url}/evidence`, { headers: { ...headers, "Content-Type": "application/pdf", "x-fiscal-source-reference": "Synthetic-official-test" }, data: Buffer.alloc(4 * 1024 * 1024 + 1) })).status()).toBe(413);
  const register = { action: "register", expectedVersion: 0, requestId: randomUUID(), reason: "Synthetic official capture", official: manualCapture(evidence, sequence("42")) };
  expect((await request.post(url, { headers, data: { ...register, official: { ...register.official, evidenceId: foreignEvidence } } })).status()).toBe(400);
  expect((await request.get(`${url}/evidence/${foreignEvidence}`)).status()).toBe(404);
  expect((await request.post(url, { headers, data: register })).status()).toBe(200);
  expect((await request.post(url, { headers, data: register })).status()).toBe(200);
  expect((await (await request.get(url)).json()).data.state).toBe("PENDIENTE_VERIFICACION");
  expect((await request.post(`/api/admin/fiscal/cases/${other}`, { headers, data: { ...register, requestId: randomUUID(), official: { ...register.official, evidenceId: foreignEvidence } } })).status()).toBe(409);
  const verify = { action: "verify", expectedVersion: 1, requestId: randomUUID(), reason: "Synthetic official review", evidenceId: evidence, status: "ACEPTADO", checkedOfficialSource: true, sourceReference: "Synthetic official consultation" };
  const concurrent = await Promise.all([request.post(url, { headers, data: verify }), request.post(url, { headers, data: { ...verify, requestId: randomUUID() } })]);
  expect(concurrent.map(r => r.status()).sort()).toEqual([200, 409]);
  expect((await (await request.get(url)).json()).data.state).toBe("CONCILIADO");
  const download = await request.get(`${url}/evidence/${evidence}`, { maxRedirects: 0 });
  expect(download.status()).toBe(302);
  expect(download.headers()["cache-control"]).toContain("no-store");
  expect((await request.get(download.headers().location)).status()).toBe(200);
});

test("administrator prepares, uploads, captures and manually reconciles through the UI", async ({ page }) => {
  await login(page.request, "admin");
  await page.goto("/admin/fiscal");
  await page.getByLabel("ID del pedido", { exact: true }).fill(orderId("41"));
  await page.getByRole("button", { name: "Cargar pedido" }).click();
  await page.getByLabel("RNC emisor", { exact: true }).fill("000000000");
  await page.getByLabel("Razón social emisor", { exact: true }).fill("Emisor sintético");
  await page.getByRole("combobox", { name: "Tratamiento", exact: true }).selectOption("taxable");
  await page.getByLabel("Tasa (%)", { exact: true }).fill("18");
  await page.getByLabel("Fundamento de clasificación", { exact: true }).fill("Clasificación sintética para pruebas");
  const prepared = page.waitForResponse(response => response.url().endsWith("/api/admin/fiscal/cases") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Preparar sin emitir" }).click();
  expect((await prepared).status()).toBe(200);
  // The isolated dev server compiles this detail route on its first navigation.
  await expect(page.getByTestId("work-state")).toHaveText("PENDIENTE_EMISION", { timeout: 30000 });
  await expect(page.getByRole("heading", { name: "Datos inmutables para copiar hacia DGII" })).toBeVisible();
  await page.getByLabel("Evidencia fiscal", { exact: true }).setInputFiles({ name: "official.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\nSynthetic official evidence\n%%EOF") });
  await page.getByLabel("Referencia de origen oficial", { exact: true }).fill("Consulta oficial sintética UI");
  await page.getByRole("button", { name: "Adjuntar evidencia" }).click();
  await expect(page.getByRole("link", { name: /Descargar Consulta/ })).toBeVisible();
  const register = page.locator("form").filter({ has: page.getByRole("button", { name: "Registrar e-CF sin verificar" }) });
  // Official sequence is ten digits after the type.
  await register.getByLabel("e-NCF oficial", { exact: true }).fill("E32" + sequence("41"));
  await register.getByLabel("RNC emisor oficial", { exact: true }).fill("000000000");
  await register.getByLabel("Fecha de emisión oficial", { exact: true }).fill("2026-01-01");
  await register.getByLabel("Base oficial DOP (0.00)", { exact: true }).fill("100.00");
  await register.getByLabel("ITBIS oficial DOP (0.00)", { exact: true }).fill("18.00");
  await register.getByLabel("Total oficial DOP (0.00)", { exact: true }).fill("118.00");
  await register.getByRole("combobox", { name: "Estado DGII observado", exact: true }).selectOption("ACEPTADO");
  await register.getByRole("combobox", { name: "Evidencia oficial", exact: true }).selectOption({ index: 1 });
  await register.getByLabel("Referencia oficial de captura", { exact: true }).fill("Captura sintética oficial UI");
  await register.getByLabel("Motivo de registro o corrección", { exact: true }).fill("Transcripción sintética para prueba UI");
  await register.getByRole("button", { name: "Registrar e-CF sin verificar" }).click();
  await expect(page.getByTestId("work-state")).toHaveText("PENDIENTE_VERIFICACION");
  const verify = page.locator("form").filter({ has: page.getByRole("button", { name: "Registrar revisión manual" }) });
  await verify.getByRole("combobox", { name: "Estado DGII observado", exact: true }).selectOption("ACEPTADO_CONDICIONAL");
  await verify.getByRole("combobox", { name: "Evidencia oficial", exact: true }).selectOption({ index: 1 });
  await verify.getByLabel("Referencia de consulta oficial revisada", { exact: true }).fill("Revisión sintética oficial UI");
  await verify.getByLabel("Resultado y observaciones de revisión", { exact: true }).fill("Identidad e importes revisados manualmente");
  await verify.getByRole("checkbox").check();
  await verify.getByRole("button", { name: "Registrar revisión manual" }).click();
  await expect(page.getByTestId("work-state")).toHaveText("CONCILIADO");
  await page.getByLabel("Motivo de corrección requerida", { exact: true }).fill("Revisión posterior requiere nueva evidencia");
  await page.getByRole("button", { name: "Marcar requiere corrección" }).click();
  await expect(page.getByTestId("work-state")).toHaveText("REQUIERE_CORRECCION");
});
