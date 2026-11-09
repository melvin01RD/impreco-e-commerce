import * as z from "zod";
export const moneySchema = z.string().regex(/^(0|[1-9]\d{0,13})\.\d{2}$/);
export const partySchema = z.object({
  taxId: z.string().regex(/^(\d{9}|\d{11})$/).optional(),
  legalName: z.string().trim().min(1).max(150).optional(),
  foreignId: z.string().trim().min(1).max(20).optional(),
  address: z.string().trim().max(100).optional(),
}).strict();
