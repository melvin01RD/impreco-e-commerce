import { FiscalError } from "../../core/fiscal-errors";
import type { ProviderResult } from "../fiscal-provider.interface";
import { issuanceResponseSchema } from "./schemas";

export function parseMedasoftResult(input: unknown): ProviderResult {
  const parsed = issuanceResponseSchema.safeParse(input);
  if (!parsed.success) throw new FiscalError("OUTCOME_UNKNOWN");
  const result = parsed.data;
  if ((result.estado === "Aceptado" || result.estado === "Aceptado Condicional") && !result.secuenciaUtilizada) {
    throw new FiscalError("OUTCOME_UNKNOWN");
  }
  const states = { Aceptado: "accepted", "Aceptado Condicional": "conditionally_accepted", Rechazado: "rejected", "En Proceso": "pending" } as const;
  return { encf: result.encf, providerId: result.trackId, status: states[result.estado] };
}
