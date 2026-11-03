import { withApi } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { fiscalCapabilities } from "@/lib/fiscal/services/queries";

export const GET = withApi({ auth: "admin", db: false }, async () => successResponse(fiscalCapabilities()));
