import { FiscalError } from "./fiscal-errors";

export type TransmissionState = "prepared" | "queued" | "sending" | "delivered" | "unknown" | "reconciling";
export type FiscalState = "unverified" | "pending" | "accepted" | "conditionally_accepted" | "rejected";
export type FiscalStatePair = { transmission: TransmissionState; fiscalStatus: FiscalState };
export type FiscalAction = { kind: "queue" | "send" | "unknown" | "reconcile" } | { kind: "result"; status: Exclude<FiscalState, "unverified"> };

export function transitionFiscal(state: FiscalStatePair, action: FiscalAction): FiscalStatePair {
  const terminal = ["accepted", "conditionally_accepted", "rejected"].includes(state.fiscalStatus);
  if (terminal) throw new FiscalError("INVALID_TRANSITION");
  if (action.kind === "queue" && state.transmission === "prepared" && state.fiscalStatus === "unverified") {
    return { transmission: "queued", fiscalStatus: "unverified" };
  }
  if (action.kind === "send" && state.transmission === "queued" && state.fiscalStatus === "unverified") {
    return { transmission: "sending", fiscalStatus: "unverified" };
  }
  if (action.kind === "unknown" && ["sending", "reconciling"].includes(state.transmission)) {
    return { transmission: "unknown", fiscalStatus: state.fiscalStatus };
  }
  if (action.kind === "reconcile" && (state.transmission === "unknown" || (state.transmission === "delivered" && state.fiscalStatus === "pending"))) {
    return { transmission: "reconciling", fiscalStatus: state.fiscalStatus };
  }
  if (action.kind === "result" && ["sending", "reconciling"].includes(state.transmission) &&
      ["pending", "accepted", "conditionally_accepted", "rejected"].includes(action.status)) {
    return { transmission: "delivered", fiscalStatus: action.status };
  }
  throw new FiscalError("INVALID_TRANSITION");
}
