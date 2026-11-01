export type FiscalErrorCode =
  | "UNSUPPORTED_TYPE" | "INVALID_ORIGIN" | "ISSUANCE_BLOCKED"
  | "INVALID_AMOUNT" | "TOTALS_MISMATCH" | "INVALID_BUYER"
  | "INVALID_TRANSITION" | "IDEMPOTENCY_CONFLICT" | "CONCURRENT_OPERATION"
  | "PROVIDER_UNVERIFIED" | "OUTCOME_UNKNOWN" | "CREDIT_LIMIT";

/** Only stable codes cross the API/audit boundary; never store raw provider errors. */
export class FiscalError extends Error {
  constructor(public readonly code: FiscalErrorCode) {
    super(code);
    this.name = "FiscalError";
  }
}
