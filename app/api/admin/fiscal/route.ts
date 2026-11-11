import { withApi } from "@/lib/api/handler";
import { errorResponse, successResponse } from "@/lib/api/response";
import { fiscalListSchema, listFiscalDocuments } from "@/lib/fiscal/services/queries";

export const GET = withApi({ auth: "admin" }, async ({ request }) => {
  const parsed = fiscalListSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return errorResponse("INVALID_FISCAL_FILTER", 400);
  return successResponse(await listFiscalDocuments(parsed.data));
});
