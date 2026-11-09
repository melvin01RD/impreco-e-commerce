export const origin = "http://localhost:3000";
export function runId() {
  const id = process.env.FISCAL_E2E_RUN_ID;
  if (!id || !/^[a-f0-9]{32}$/.test(id)) throw new Error("Fiscal DEV run ID required.");
  return id;
}
export function orderId(suffix: string) {
  if (!["11", "41", "42", "43"].includes(suffix)) throw new Error("Unknown synthetic order.");
  return runId().slice(0, 20) + suffix.padStart(4, "0");
}
export const orderReference = (suffix: string) => `TEST-FISCAL-${runId()}-${suffix}`;
export const email = (role: "admin" | "customer") => `${role}.${runId()}@fiscal-test.invalid`;
export function password() {
  const value = process.env.FISCAL_E2E_PASSWORD;
  if (!value) throw new Error("Synthetic password required.");
  return value;
}
export function sequence(suffix: "41" | "42") {
  const base = Number(process.env.FISCAL_E2E_SEQUENCE);
  if (!Number.isSafeInteger(base) || base < 1 || base > 9999999998) throw new Error("Synthetic sequence required.");
  return String(base + (suffix === "42" ? 1 : 0)).padStart(10, "0");
}
