import * as z from "zod";

export const loginResponseSchema = z.object({ token: z.string().min(1).max(16384) });
export const companyResponseSchema = z.object({
  registryNumber: z.string().regex(/^(\d{9}|\d{11})$/),
  isActive: z.boolean(), dgiiServer: z.enum(["testecf", "certecf", "ecf"]),
});
// Verified public response shape, not a complete request contract or certification.
export const issuanceResponseSchema = z.object({
  trackId: z.string().min(1).max(200),
  encf: z.string().regex(/^E(31|32|33|34|41|43|45)\d{10}$/),
  estado: z.enum(["Aceptado", "Aceptado Condicional", "Rechazado", "En Proceso"]),
  codigo: z.string().max(30),
  secuenciaUtilizada: z.boolean(),
});
