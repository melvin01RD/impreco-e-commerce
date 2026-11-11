import { withApi } from "@/lib/api/handler";
import { objectIdSchema } from "@/lib/fiscal/manual/contracts";
import { manualResponse, readManualJson } from "@/lib/fiscal/manual/http";
import { executeCaseCommand, getCaseDetail } from "@/lib/fiscal/manual/service";

export const GET = withApi<{ id: string }>({ auth: "admin" }, async ({ params }) => manualResponse(() => getCaseDetail(objectIdSchema.parse(params.id))));
export const POST = withApi<{ id: string }>({ auth: "admin", demo: "block-mutations", rateLimit: { action: "fiscal:command", preset: "moderate" } }, async ({ params, request, session }) => manualResponse(async () => executeCaseCommand(objectIdSchema.parse(params.id), await readManualJson(request), session.user.id)));
