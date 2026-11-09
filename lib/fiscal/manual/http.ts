import { NextRequest } from "next/server";
import { errorResponse, successResponse } from "@/lib/api/response";
import { ApiError } from "@/lib/api/errors";
import { ZodError } from "zod";

export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) throw new ApiError("ORIGEN_NO_AUTORIZADO", 403);
}
export async function manualResponse(action: () => Promise<unknown>) {
  try { return successResponse(await action()); }
  catch (error) {
    if (error instanceof ApiError) return errorResponse(error.message, error.statusCode);
    if (error instanceof ZodError || error instanceof SyntaxError) return errorResponse("DATOS_FISCALES_INVALIDOS", 400);
    return errorResponse("OPERACION_FISCAL_NO_CONFIRMADA; recargue y reintente con la misma clave.", 503);
  }
}
export async function readManualJson(request: NextRequest) {
  assertSameOrigin(request);
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError("CUERPO_REQUERIDO", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 256 * 1024) { await reader.cancel(); throw new ApiError("CUERPO_DEMASIADO_GRANDE", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
