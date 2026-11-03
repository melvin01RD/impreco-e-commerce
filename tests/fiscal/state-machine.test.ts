import { test } from "node:test";
import assert from "node:assert/strict";
import { transitionFiscal, type FiscalStatePair } from "../../lib/fiscal/core/state-machine";
import { validateSalesBuyer, validateSnapshotAmounts } from "../../lib/fiscal/core/fiscal-validator";
import { fixture } from "./fixtures";

test("timeout requires reconciliation and cannot enqueue or send again", () => {
  let state: FiscalStatePair = { transmission: "prepared", fiscalStatus: "unverified" };
  state = transitionFiscal(state, { kind: "queue" });
  state = transitionFiscal(state, { kind: "send" });
  state = transitionFiscal(state, { kind: "unknown" });
  assert.equal(state.fiscalStatus, "unverified");
  assert.throws(() => transitionFiscal(state, { kind: "queue" }), /INVALID_TRANSITION/);
  assert.throws(() => transitionFiscal(state, { kind: "send" }), /INVALID_TRANSITION/);
  state = transitionFiscal(state, { kind: "reconcile" });
  state = transitionFiscal(state, { kind: "result", status: "accepted" });
  assert.throws(() => transitionFiscal(state, { kind: "unknown" }), /INVALID_TRANSITION/);
});

test("pending can reconcile; rejected and accepted are preserved", () => {
  assert.equal(transitionFiscal({ transmission: "delivered", fiscalStatus: "pending" }, { kind: "reconcile" }).transmission, "reconciling");
  for (const fiscalStatus of ["accepted", "rejected", "conditionally_accepted"] as const) {
    assert.throws(() => transitionFiscal({ transmission: "delivered", fiscalStatus }, { kind: "queue" }), /INVALID_TRANSITION/);
  }
});

test("E31 buyer, E32 threshold and foreign identification are checked without collecting unnecessary data", () => {
  validateSalesBuyer("E32", "249999.99", {});
  assert.throws(() => validateSalesBuyer("E32", "250000.00", {}), /INVALID_BUYER/);
  assert.throws(() => validateSalesBuyer("E31", "10.00", {}), /INVALID_BUYER/);
  validateSalesBuyer("E31", "10.00", { taxId: "000000000", legalName: "Test" });
  assert.throws(() => validateSalesBuyer("E31", "10.00", { taxId: "abc", legalName: "Test" }), /INVALID_BUYER/);
  validateSalesBuyer("E32", "250000.01", { foreignId: "TEST-ID", legalName: "Test" });
  assert.throws(() => validateSalesBuyer("E32", "250000.01", { foreignId: "TEST-ID", taxId: "000000000", legalName: "Test" }), /INVALID_BUYER/);
});

test("snapshot amounts are recomputed instead of trusting client totals", () => {
  validateSnapshotAmounts(fixture());
  const altered = fixture(); altered.totals.total = "117.99";
  assert.throws(() => validateSnapshotAmounts(altered), /TOTALS_MISMATCH/);
});
