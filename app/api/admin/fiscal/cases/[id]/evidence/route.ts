import { createHash, randomUUID } from "node:crypto";
import { withApi } from "@/lib/api/handler";
import { ApiError, NotFoundError } from "@/lib/api/errors";
import { FiscalCase, FiscalEvidence } from "@/models/fiscal-case.model";
import { getStorageConfig, createStorageService } from "@/lib/storage";
import { EVIDENCE_LIMIT, EVIDENCE_PREFIX, evidenceMetadataSchema, evidenceType, objectIdSchema } from "@/lib/fiscal/manual/contracts";
import { assertSameOrigin, manualResponse } from "@/lib/fiscal/manual/http";

export const POST = withApi<{ id: string }>({ auth: "admin", demo: "block-mutations", rateLimit: { action: "fiscal:evidence", preset: "moderate" } }, async ({ request, params, session }) => manualResponse(async () => {
  assertSameOrigin(request);
  const id = objectIdSchema.parse(params.id);
  if (!await FiscalCase.exists({ _id: id })) throw new NotFoundError("Expediente");
  const metadata = evidenceMetadataSchema.parse({ source: "FACTURADOR_GRATUITO_DGII", sourceReference: decodeURIComponent(request.headers.get("x-fiscal-source-reference") ?? "") });
  const mime = request.headers.get("content-type") ?? "";
  if (!["application/pdf", "image/png", "image/jpeg"].includes(mime)) throw new ApiError("Solo PDF, PNG o JPEG", 400);
  if (Number(request.headers.get("content-length")) > EVIDENCE_LIMIT) throw new ApiError("Evidencia: máximo 4 MiB", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError("Archivo requerido", 400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > EVIDENCE_LIMIT) { await reader.cancel(); throw new ApiError("Evidencia: máximo 4 MiB", 413); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = Buffer.concat(chunks);
  let extension: string;
  try { extension = evidenceType(bytes, mime); } catch { throw new ApiError("Firma del archivo no coincide con el tipo permitido", 400); }
  const config = await getStorageConfig();
  if (config.provider === "local" || !config.privateBucketName || config.privateBucketName === config.bucketName) throw new ApiError("Configure un bucket privado separado para evidencia fiscal", 503);
  const key = `${EVIDENCE_PREFIX}${id}/${randomUUID()}.${extension}`;
  const storage = createStorageService(config);
  const uploaded = await storage.uploadPrivateFile(bytes, { fileName: `evidencia.${extension}`, fileSize: size, contentType: mime, customPath: key });
  if (!uploaded.success || uploaded.key !== key) throw new ApiError("Carga no confirmada", 503);
  // Retain the blob on an uncertain acknowledgement: metadata may already reference it.
  const evidence = await FiscalEvidence.create({ caseId: id, key, mime, size, sha256: createHash("sha256").update(bytes).digest("hex"), ...metadata, actorId: session.user.id });
  return { id: String(evidence._id), sha256: evidence.sha256, size, mime };
}));
