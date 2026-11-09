import { test, expect } from "@playwright/test";

// No login, fixtures, seeding or business/fiscal mutations against shared DEV.
test("DEV protects fiscal data from anonymous requests", async ({ request }) => {
  for (const path of ["/api/admin/fiscal", "/api/admin/fiscal/capabilities", "/api/admin/fiscal/cases/000000000000000000000001"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(401);
    expect(await response.text()).not.toContain("snapshotJson");
  }
});

test("DEV protects commercial invoices", async ({ request }) => {
  expect((await request.get("/api/orders/000000000000000000000001/invoice")).status()).toBe(401);
});

test("DEV has no anonymous Better Auth session", async ({ request }) => {
  const response = await request.get("/api/auth/get-session");
  expect(response.status()).toBe(200);
  expect(await response.json()).toBeNull();
});
