"use client";
import { useRef, useState, type FormEvent } from "react";
import type { FiscalSnapshot } from "@/lib/fiscal/core/snapshot";
import { DGII_STATES, type OfficialCapture } from "@/lib/fiscal/manual/contracts";
import { buttonStyle, fieldStyle, fiscalRequest, TextField } from "./manual-workbench";

interface Detail {
  _id: string; orderReference: string; type: string; state: string; officialStatus?: string; encf?: string;
  snapshotHash: string; snapshot: FiscalSnapshot; capture: OfficialCapture | null; version: number;
  capturedBy?: string; capturedAt?: string; reviewedBy?: string; reviewedAt?: string; originalEncf?: string;
  evidence: { _id: string; mime: string; sha256: string; actorId: string; createdAt: string; sourceReference: string }[];
  events: { _id: string; action: string; actorId: string; version: number; occurredAt: string; detail: Record<string, unknown> }[];
}
export function ManualCaseDetail({ initial }: { initial: Detail }) {
  const [data, setData] = useState(initial);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const retry = useRef<{ signature: string; requestId: string } | null>(null);
  const api = `/api/admin/fiscal/cases/${data._id}`;
  async function reload() { setData(await fiscalRequest<Detail>(api)); }
  async function command(payload: Record<string, unknown>) {
    setBusy(true); setMessage("");
    const input = { ...payload, expectedVersion: data.version };
    const signature = JSON.stringify(input);
    if (retry.current?.signature !== signature) retry.current = { signature, requestId: crypto.randomUUID() };
    try {
      await fiscalRequest(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, requestId: retry.current.requestId }) });
      await reload(); retry.current = null; setMessage("Operación registrada. Consulte el estado interno y la trazabilidad.");
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const file = form.get("file") as File;
    if (!file?.size || file.size > 4 * 1024 * 1024) { setMessage("Seleccione evidencia de hasta 4 MiB."); return; }
    setBusy(true); setMessage("");
    try {
      await fiscalRequest(`${api}/evidence`, { method: "POST", headers: { "Content-Type": file.type, "x-fiscal-source-reference": encodeURIComponent(String(form.get("sourceReference"))) }, body: file });
      await reload(); setMessage("Evidencia almacenada. Su origen deberá ser revisado manualmente.");
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "");
    void command({ action: "register", reason: text("reason"), official: {
      type: data.type, encf: text("encf"), issuerTaxId: text("issuerTaxId"), issuedOn: text("issuedOn"), status: text("status"),
      buyer: { ...(text("buyerTaxId") ? { taxId: text("buyerTaxId") } : {}), ...(text("buyerName") ? { legalName: text("buyerName") } : {}), ...(text("foreignId") ? { foreignId: text("foreignId") } : {}) },
      currency: "DOP", base: text("base"), tax: text("tax"), total: text("total"),
      ...(data.type === "E33" ? { originalEncf: text("originalEncf") } : {}),
      evidenceId: text("evidenceId"), source: "FACTURADOR_GRATUITO_DGII", sourceReference: text("sourceReference"),
    } });
  }
  const evidenceSelect = <label className="grid gap-1">Evidencia oficial<select className={fieldStyle} name="evidenceId" required><option value="">Seleccione evidencia adjunta</option>{data.evidence.map(item => <option key={item._id} value={item._id}>{item.sourceReference} · {item.createdAt}</option>)}</select></label>;
  const statusSelect = <label className="grid gap-1">Estado DGII observado<select className={fieldStyle} name="status" required defaultValue=""><option value="">Seleccione lo observado</option>{DGII_STATES.map(s => <option key={s}>{s}</option>)}</select></label>;
  return <div className="space-y-6">
    <h1 className="text-2xl font-semibold">Expediente fiscal · {data.orderReference}</h1>
    <p>Trabajo interno: <strong data-testid="work-state">{data.state}</strong> · Estado DGII reportado: <strong>{data.officialStatus ?? "No reportado"}</strong></p>
    <p>e-NCF: {data.encf ?? "Sin registrar"}. Preparar o capturar datos no emite un comprobante ni consulta DGII.</p>
    {message && <p role="alert" className="rounded border p-3">{message}</p>}
    <button type="button" className={buttonStyle} disabled={busy} onClick={() => void reload().catch(e => setMessage(e.message))}>Recargar expediente</button>
    <section className="space-y-3 rounded border p-4"><h2 className="text-lg font-semibold">Datos inmutables para copiar hacia DGII</h2>
      <p>Emisor: {data.snapshot.issuer.taxId} · {data.snapshot.issuer.legalName}</p><p>Receptor: {data.snapshot.buyer.taxId ?? data.snapshot.buyer.foreignId ?? "No identificado"} · {data.snapshot.buyer.legalName}</p>
      <div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Descripción</th><th>Cantidad</th><th>Precio</th><th>Descuento</th><th>Base</th><th>ITBIS</th><th>Total</th></tr></thead><tbody>{data.snapshot.lines.map(line => <tr key={line.id}><td>{line.description}</td><td>{line.quantity}</td><td>{line.unitPrice}</td><td>{line.discount}</td><td>{line.base}</td><td>{line.tax} ({line.rate}%)</td><td>{line.total}</td></tr>)}</tbody></table></div>
      <p>{data.snapshot.currency} · Base {data.snapshot.totals.base} · Impuesto {data.snapshot.totals.tax} · Total {data.snapshot.totals.total}</p>
      <p className="break-all text-xs">SHA-256: {data.snapshotHash}</p>
      <button className={buttonStyle} onClick={() => void navigator.clipboard.writeText(JSON.stringify(data.snapshot, null, 2)).then(() => setMessage("Datos comerciales copiados; no constituyen un e-CF."), () => setMessage("No se pudo copiar. Puede seleccionar los datos del detalle."))}>Copiar datos comerciales</button>
    </section>
    <section className="space-y-3 rounded border p-4"><h2 className="text-lg font-semibold">Evidencia de origen oficial</h2>
      <p>Adjunte PDF, PNG o JPEG obtenido del Facturador Gratuito/consulta oficial. Máximo 4 MiB. No adjunte credenciales ni certificados digitales.</p>
      <form onSubmit={upload} className="grid gap-3"><label>Evidencia fiscal<input name="file" type="file" accept="application/pdf,image/png,image/jpeg" required /></label><TextField label="Referencia de origen oficial" name="sourceReference" /><button disabled={busy} className={buttonStyle}>Adjuntar evidencia</button></form>
      <ul>{data.evidence.map(item => <li key={item._id} className="py-2 text-sm"><a className="underline" href={`${api}/evidence/${item._id}`}>Descargar {item.sourceReference}</a><p className="break-all">{item.createdAt} · {item.actorId} · SHA-256 {item.sha256}</p></li>)}</ul>
    </section>
    <section className="space-y-3 rounded border p-4"><h2 className="text-lg font-semibold">Registrar o corregir captura del e-CF oficial</h2>
      <p>Transcriba los importes del documento oficial. Cada registro vuelve a PENDIENTE_VERIFICACION y conserva el historial anterior.</p>
      <form key={data.version} onSubmit={register} className="grid gap-3 md:grid-cols-2">
        <TextField label="e-NCF oficial" name="encf" defaultValue={data.capture?.encf} /><TextField label="RNC emisor oficial" name="issuerTaxId" defaultValue={data.capture?.issuerTaxId} />
        <TextField label="RNC/cédula receptor oficial" name="buyerTaxId" required={false} defaultValue={data.capture?.buyer.taxId} /><TextField label="Razón social receptor oficial" name="buyerName" required={false} defaultValue={data.capture?.buyer.legalName} /><TextField label="Identificación extranjera oficial" name="foreignId" required={false} defaultValue={data.capture?.buyer.foreignId} />
        <TextField label="Fecha de emisión oficial" name="issuedOn" type="date" defaultValue={data.capture?.issuedOn} />
        {data.type === "E33" && <TextField label="e-NCF original del ajuste" name="originalEncf" defaultValue={data.capture?.originalEncf} />}
        <TextField label="Base oficial DOP (0.00)" name="base" defaultValue={data.capture?.base} /><TextField label="ITBIS oficial DOP (0.00)" name="tax" defaultValue={data.capture?.tax} /><TextField label="Total oficial DOP (0.00)" name="total" defaultValue={data.capture?.total} />
        {statusSelect}{evidenceSelect}<TextField label="Referencia oficial de captura" name="sourceReference" /><TextField label="Motivo de registro o corrección" name="reason" />
        <button disabled={busy || !data.evidence.length} className={buttonStyle}>Registrar e-CF sin verificar</button>
      </form>
    </section>
    <section className="space-y-3 rounded border p-4"><h2 className="text-lg font-semibold">Verificación manual y conciliación</h2>
      <p>No se realiza una consulta automatizada. Revise el origen oficial, identidad, número, fecha e importes antes de confirmar. Una diferencia o rechazo requiere corrección.</p>
      <p>Captura: {data.capturedBy ?? "Pendiente"} · {data.capturedAt}. Revisión manual: {data.reviewedBy ?? "Pendiente"} · {data.reviewedAt}.</p>
      <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void command({ action: "verify", status: form.get("status"), evidenceId: form.get("evidenceId"), sourceReference: form.get("sourceReference"), reason: form.get("reason"), checkedOfficialSource: form.get("checked") === "on" }); }} className="grid gap-3">
        {statusSelect}{evidenceSelect}<TextField label="Referencia de consulta oficial revisada" name="sourceReference" /><TextField label="Resultado y observaciones de revisión" name="reason" />
        <label><input type="checkbox" name="checked" required /> Revisé manualmente la evidencia oficial y los datos completos del comprobante.</label>
        <button disabled={busy || !data.capture} className={buttonStyle}>Registrar revisión manual</button>
      </form>
      <form className="flex items-end gap-3" onSubmit={event => { event.preventDefault(); void command({ action: "correction", reason: new FormData(event.currentTarget).get("reason") }); }}><TextField label="Motivo de corrección requerida" name="reason" /><button disabled={busy} className={buttonStyle}>Marcar requiere corrección</button></form>
    </section>
    <section><h2 className="text-lg font-semibold">Historial auditable (últimos 200 eventos)</h2><ol>{data.events.map(event => <li className="border-b py-3" key={event._id}><p>v{event.version} · {event.action} · {event.actorId} · {event.occurredAt}</p><details><summary>Ver cambios y motivo</summary><pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(event.detail, null, 2)}</pre></details></li>)}</ol></section>
  </div>;
}
