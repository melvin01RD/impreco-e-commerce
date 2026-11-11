import * as z from "zod";
import { withApi } from "@/lib/api/handler";
import { FiscalCase } from "@/models/fiscal-case.model";
import { WORK_STATES } from "@/lib/fiscal/manual/contracts";
import { manualResponse, readManualJson } from "@/lib/fiscal/manual/http";
import { prepareCase } from "@/lib/fiscal/manual/service";

export const GET = withApi({ auth: "admin" }, async ({ request }) => manualResponse(async () => {
  const query = z.object({ state: z.enum(WORK_STATES).optional(), page: z.coerce.number().int().min(1).max(1000).default(1) }).parse(Object.fromEntries(request.nextUrl.searchParams));
  const rows = await FiscalCase.find(query.state ? { state: query.state } : {}).sort({ createdAt: -1, _id: -1 }).skip((query.page - 1) * 25).limit(26).lean();
  return { documents: rows.slice(0, 25), page: query.page, hasNext: rows.length > 25 };
}));
export const POST = withApi({ auth: "admin", demo: "block-mutations", rateLimit: { action: "fiscal:prepare", preset: "moderate" } }, async ({ request, session }) => manualResponse(async () => prepareCase(await readManualJson(request), session.user.id)));
