import { withApi } from "@/lib/api/handler";
import { errorResponse, notFoundResponse, successResponse } from "@/lib/api/response";
import { getFiscalTrace } from "@/lib/fiscal/services/queries";

export const GET = withApi<{ id: string }>({ auth: "admin" }, async ({ params, request }) => {
  const cursor = Number(request.nextUrl.searchParams.get("afterVersion") ?? -1);
  if (!Number.isSafeInteger(cursor) || cursor < -1) return errorResponse("INVALID_FISCAL_CURSOR", 400);
  const trace = await getFiscalTrace(params.id, cursor);
  return trace ? successResponse(trace) : notFoundResponse("FiscalInvoice");
});
