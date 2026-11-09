import { withApi } from "@/lib/api/handler";
import { errorResponse } from "@/lib/api/response";
import { FiscalEvidence } from "@/models/fiscal-case.model";
import { createStorageService, getStorageConfig } from "@/lib/storage";
import { EVIDENCE_PREFIX, objectIdSchema } from "@/lib/fiscal/manual/contracts";

export const GET = withApi<{ id: string; evidenceId: string }>({ auth: "admin" }, async ({ params }) => {
  if (!objectIdSchema.safeParse(params.id).success || !objectIdSchema.safeParse(params.evidenceId).success) return errorResponse("ID_INVALIDO", 400);
  const evidence = await FiscalEvidence.findOne({ _id: params.evidenceId, caseId: params.id }).select("+key").lean();
  if (!evidence || !new RegExp(`^${EVIDENCE_PREFIX}${params.id}/[a-f0-9-]{36}\\.(pdf|png|jpg)$`).test(evidence.key)) return errorResponse("EVIDENCIA_NO_ENCONTRADA", 404);
  try {
    const config = await getStorageConfig();
    if (config.provider === "local" || !config.privateBucketName || config.privateBucketName === config.bucketName) return errorResponse("ALMACENAMIENTO_PRIVADO_REQUERIDO", 503);
    // Prevent the legacy provider fallback from looking in the public bucket.
    const download = await createStorageService({ ...config, bucketName: config.privateBucketName, publicUrl: undefined }).getPrivateDownload(evidence.key, { expiresInSeconds: 60, filename: `evidencia.${evidence.key.split(".").pop()}`, disposition: "attachment" });
    const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
    if (download.kind === "redirect") return new Response(null, { status: 302, headers: { ...headers, Location: download.url } });
    return new Response(download.body, { headers: { ...headers, "Content-Type": evidence.mime, "Content-Disposition": "attachment" } });
  } catch { return errorResponse("DESCARGA_NO_DISPONIBLE", 503); }
});
