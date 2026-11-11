import "server-only";
import { createHash } from "node:crypto";
import { Order } from "@/models/order.model";
import { FiscalInvoice } from "@/models/fiscal-invoice.model";
import { FiscalCase, FiscalCaseEvent, FiscalEvidence, FiscalOfficialClaim } from "@/models/fiscal-case.model";
import { runTransaction } from "@/lib/db-transaction";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/api/errors";
import { caseCommandSchema, prepareCaseSchema, officialSchema, type OfficialCapture } from "./contracts";
import { buildOrderSnapshot, captureMatches, reconciledState, type CommercialOrder } from "./snapshot";
import { serializeSnapshot } from "../core/snapshot";
import { validateSalesBuyer } from "../core/fiscal-validator";
import { decimalUnits } from "../core/tax-calculator";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function actor(id: string) { if (!id || id.length > 120) throw new ValidationError("ACTOR_REQUERIDO"); }
export async function prepareCase(raw: unknown, actorId: string) {
  actor(actorId);
  const data = prepareCaseSchema.parse(raw);
  const identity = { issuerTaxId: data.issuer.taxId, orderId: data.orderId };
  const inputHash = hash(data);
  const replay = async () => {
    const existing = await FiscalCase.findOne(identity);
    if (existing && existing.inputHash !== inputHash) throw new ConflictError("EXPEDIENTE_EXISTENTE_CON_OTROS_DATOS");
    return existing;
  };
  const existing = await replay();
  if (existing) return { id: String(existing._id) };
  try {
    return await runTransaction("fiscal.manual.prepare", async session => {
      const order = await Order.findById(data.orderId).session(session).lean();
      if (!order) throw new NotFoundError("Pedido");
      let built: ReturnType<typeof buildOrderSnapshot>;
      try { built = buildOrderSnapshot(order as unknown as CommercialOrder, data); }
      catch { throw new ValidationError("Revisar moneda DOP, clasificación, comprador e importes del pedido; deben coincidir exactamente."); }
      let originalEncf: string | undefined;
      if (data.type === "E33") {
        const original = await FiscalCase.findOne({ _id: data.originalCaseId, issuerTaxId: data.issuer.taxId, type: { $in: ["E31", "E32"] }, state: "CONCILIADO" }).select("+snapshotJson").session(session);
        if (!original || String(original.orderId) === data.orderId || !original.encf) throw new ValidationError("E33 requiere otro pedido de ajuste y expediente original conciliado.");
        const originalSnapshot = serializeSnapshot(JSON.parse(original.snapshotJson)).snapshot;
        if (JSON.stringify(originalSnapshot.buyer) !== JSON.stringify(built.snapshot.buyer)) throw new ValidationError("RECEPTOR_AJUSTE_NO_COINCIDE");
        originalEncf = original.encf;
      }
      const [created] = await FiscalCase.create([{
        ...identity, type: data.type, orderReference: order.orderNumber, snapshotJson: built.json,
        snapshotHash: built.hash, inputHash, preparedBy: actorId,
        originalCaseId: data.originalCaseId, originalEncf, adjustmentReason: data.adjustmentReason,
      }], { session });
      await FiscalCaseEvent.create([{ caseId: created._id, version: 0, action: "prepared", actorId,
        requestId: "prepare", requestHash: inputHash,
        detailJson: JSON.stringify({ snapshotHash: built.hash, adjustmentReason: data.adjustmentReason, originalCaseId: data.originalCaseId }),
      }], { session });
      return { id: String(created._id) };
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const document = await replay();
      if (document) return { id: String(document._id) };
    }
    throw error;
  }
}

export async function executeCaseCommand(id: string, raw: unknown, actorId: string) {
  actor(actorId);
  const command = caseCommandSchema.parse(raw);
  const requestHash = hash({ command, actorId });
  const replay = async () => {
    const event = await FiscalCaseEvent.findOne({ caseId: id, requestId: command.requestId });
    if (event && event.requestHash !== requestHash) throw new ConflictError("CLAVE_IDEMPOTENTE_REUTILIZADA");
    return event ? { id, version: event.version, replayed: true } : null;
  };
  const done = await replay();
  if (done) return done;
  try {
    return await runTransaction("fiscal.manual.command", async session => {
      const current = await FiscalCase.findById(id).select("+snapshotJson +captureJson").session(session);
      if (!current) throw new NotFoundError("Expediente");
      if (current.version !== command.expectedVersion) throw new ConflictError("VERSION_DESACTUALIZADA; recargue antes de modificar.");
      const snapshot = serializeSnapshot(JSON.parse(current.snapshotJson)).snapshot;
      const now = new Date();
      let changes: Record<string, unknown> = {};
      let detail: Record<string, unknown> = { reason: command.reason, previousState: current.state, previousCapture: current.captureJson ? JSON.parse(current.captureJson) : null };
      if (command.action === "correction") {
        changes = { state: "REQUIERE_CORRECCION" };
      } else {
        const evidenceId = command.action === "register" ? command.official.evidenceId : command.evidenceId;
        if (!await FiscalEvidence.exists({ _id: evidenceId, caseId: id }).session(session)) throw new ValidationError("EVIDENCIA_NO_PERTENECE_AL_EXPEDIENTE");
        if (command.action === "register") {
          const capture = command.official;
          if (capture.type !== current.type || capture.issuerTaxId !== current.issuerTaxId || capture.originalEncf !== current.originalEncf) throw new ValidationError("IDENTIDAD_FISCAL_NO_COINCIDE");
          try {
            validateSalesBuyer(capture.type === "E32" ? "E32" : "E31", capture.total, capture.buyer);
            if (decimalUnits(capture.base) + decimalUnits(capture.tax) !== decimalUnits(capture.total)) throw new Error();
          } catch { throw new ValidationError("IMPORTES_O_RECEPTOR_OFICIAL_INVALIDOS"); }
          if (await FiscalInvoice.exists({ environment: "production", issuerTaxId: capture.issuerTaxId, encf: capture.encf }).session(session)) throw new ConflictError("E_NCF_EXISTENTE_EN_REGISTRO_FISCAL_ANTERIOR");
          const claim = await FiscalOfficialClaim.findOne({ issuerTaxId: capture.issuerTaxId, encf: capture.encf }).session(session);
          if (claim && String(claim.caseId) !== id) throw new ConflictError("E_NCF_YA_REGISTRADO_PARA_EL_EMISOR");
          if (!claim) await FiscalOfficialClaim.create([{ issuerTaxId: capture.issuerTaxId, encf: capture.encf, caseId: id }], { session });
          changes = { captureJson: JSON.stringify(capture), encf: capture.encf, officialStatus: capture.status,
            capturedBy: actorId, capturedAt: now, state: "PENDIENTE_VERIFICACION", reviewedBy: null, reviewedAt: null };
          detail = { ...detail, capture, matchesSnapshot: captureMatches(snapshot, capture) };
        } else {
          if (!current.captureJson) throw new ValidationError("REGISTRE_PRIMERO_EL_COMPROBANTE_OFICIAL");
          const capture: OfficialCapture = officialSchema.parse(JSON.parse(current.captureJson));
          const matches = captureMatches(snapshot, capture);
          changes = { officialStatus: command.status, state: reconciledState(command.status, matches), reviewedBy: actorId, reviewedAt: now };
          detail = { ...detail, evidenceId, reportedStatus: command.status, sourceReference: command.sourceReference,
            method: "REVISION_MANUAL_EVIDENCIA_OFICIAL", checkedOfficialSource: true, matchesSnapshot: matches };
        }
      }
      const changed = await FiscalCase.updateOne({ _id: id, version: command.expectedVersion }, { $set: changes, $inc: { version: 1 } }, { session, runValidators: true });
      if (changed.modifiedCount !== 1) throw new ConflictError("VERSION_DESACTUALIZADA");
      await FiscalCaseEvent.create([{ caseId: id, version: current.version + 1, action: command.action, actorId,
        requestId: command.requestId, requestHash, detailJson: JSON.stringify({ ...detail, nextState: changes.state }), occurredAt: now,
      }], { session });
      return { id, version: current.version + 1, replayed: false };
    });
  } catch (error) {
    const repeated = await replay();
    if (repeated) return repeated;
    if ((error as { code?: number }).code === 11000) throw new ConflictError("E_NCF_O_OPERACION_DUPLICADA");
    throw error;
  }
}

export async function getCaseDetail(id: string) {
  const document = await FiscalCase.findById(id).select("+snapshotJson +captureJson").lean();
  if (!document) throw new NotFoundError("Expediente");
  const [events, evidence] = await Promise.all([
    FiscalCaseEvent.find({ caseId: id }).select("+detailJson").sort({ version: -1 }).limit(200).lean(),
    FiscalEvidence.find({ caseId: id }).sort({ createdAt: -1 }).limit(200).lean(),
  ]);
  return JSON.parse(JSON.stringify({ ...document, snapshot: JSON.parse(document.snapshotJson),
    capture: document.captureJson ? JSON.parse(document.captureJson) : null, snapshotJson: undefined, captureJson: undefined,
    events: events.map(e => ({ ...e, detail: JSON.parse(e.detailJson), detailJson: undefined })), evidence,
  }));
}
