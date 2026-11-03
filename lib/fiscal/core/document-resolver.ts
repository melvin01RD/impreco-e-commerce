import { FiscalError } from "./fiscal-errors";

/** An explicit request, never inferred from a company name or saved customer profile. */
export function resolveSalesDocumentType(request: unknown): "E31" | "E32" {
  if (request === undefined || request === "E32") return "E32";
  if (request === "E31") return "E31";
  throw new FiscalError("UNSUPPORTED_TYPE");
}
