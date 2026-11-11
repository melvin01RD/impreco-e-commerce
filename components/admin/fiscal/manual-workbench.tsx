"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "@/hooks/use-locale-navigation";
import { WORK_STATES, MANUAL_TYPES } from "@/lib/fiscal/manual/contracts";

export interface CaseRow { _id: string; orderReference: string; type: string; state: string; officialStatus?: string; encf?: string }
interface Source { _id: string; orderNumber: string; currency?: string; items: { name: string; price: number; quantity: number }[]; subtotal: number; discount: number; tax: number; shippingCost: number; total: number }
export async function fiscalRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : body.error?.message ?? body.message ?? "Operación no confirmada; recargue antes de reintentar.");
  return body.data;
}
export const fieldStyle = "rounded border bg-background px-3 py-2 text-sm";
export const buttonStyle = "rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50";
export function TextField({ label, name, required = true, type = "text", defaultValue }: { label: string; name: string; required?: boolean; type?: string; defaultValue?: string }) {
  return <label className="grid gap-1 text-sm">{label}<input className={fieldStyle} name={name} type={type} required={required} defaultValue={defaultValue} maxLength={300} /></label>;
}

export function ManualWorkbench({ initial, basePath }: { initial: CaseRow[]; basePath: string }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [source, setSource] = useState<Source | null>(null);
  const [type, setType] = useState("E32");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [hasNext, setHasNext] = useState(initial.length === 25);
  async function refresh(state: string, nextPage = 1) {
    try {
      const data = await fiscalRequest<{ documents: CaseRow[]; hasNext: boolean }>(`/api/admin/fiscal/cases?page=${nextPage}${state ? `&state=${state}` : ""}`);
      setRows(data.documents); setFilter(state); setPage(nextPage); setHasNext(data.hasNext);
    } catch (e) { setMessage((e as Error).message); }
  }
  async function loadOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { setSource(await fiscalRequest<Source>(`/api/admin/fiscal/cases/source?orderId=${new FormData(event.currentTarget).get("orderId")}`)); }
    catch (e) { setSource(null); setMessage((e as Error).message); } finally { setBusy(false); }
  }
  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!source) return;
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "");
    const classification = (key: string) => ({ treatment: text(`${key}-treatment`), rate: text(`${key}-rate`), classificationReference: text(`${key}-reference`) });
    setBusy(true); setMessage("");
    try {
      const created = await fiscalRequest<{ id: string }>("/api/admin/fiscal/cases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        orderId: source._id, type, issuer: { taxId: text("issuerTaxId"), legalName: text("issuerName") },
        buyer: { ...(text("buyerTaxId") ? { taxId: text("buyerTaxId") } : {}), ...(text("buyerName") ? { legalName: text("buyerName") } : {}), ...(text("foreignId") ? { foreignId: text("foreignId") } : {}) },
        classifications: source.items.map((_, i) => classification(String(i))),
        ...(source.shippingCost ? { shippingClassification: classification("shipping") } : {}),
        ...(type === "E33" ? { originalCaseId: text("originalCaseId"), adjustmentReason: text("adjustmentReason") } : {}),
      }) });
      router.push(`${basePath}/cases/${created.id}`);
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  const classificationFields = (key: string, name: string) => <fieldset key={key} className="grid gap-3 rounded border p-3 md:grid-cols-3"><legend>{name}</legend>
    <label className="grid gap-1">Tratamiento<select name={`${key}-treatment`} required className={fieldStyle}><option value="">Seleccione</option><option value="taxable">Gravado</option><option value="exempt">Exento</option></select></label>
    <TextField label="Tasa (%)" name={`${key}-rate`} /><TextField label="Fundamento de clasificación" name={`${key}-reference`} />
  </fieldset>;
  return <div className="space-y-6">
    {message && <p role="alert" className="rounded border p-3">{message}</p>}
    <section className="space-y-4 rounded border p-4"><h2 className="text-lg font-semibold">Preparar expediente desde pedido</h2>
      <form onSubmit={loadOrder} className="flex items-end gap-3"><TextField label="ID del pedido" name="orderId" /><button disabled={busy} className={buttonStyle}>Cargar pedido</button></form>
      {source && <form onSubmit={prepare} className="space-y-4">
        <p>Pedido {source.orderNumber} · {source.currency ?? "Sin moneda: requiere corrección comercial"} · Subtotal {source.subtotal} · Descuento {source.discount} · Impuesto {source.tax} · Envío {source.shippingCost} · Total {source.total}</p>
        <p>Se conserva el precio comercial sin impuestos incluidos. Clasifique cada línea; cualquier diferencia de importes bloquea la preparación.</p>
        <label className="grid gap-1">Tipo<select className={fieldStyle} value={type} onChange={e => setType(e.target.value)}>{MANUAL_TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
        <div className="grid gap-3 md:grid-cols-2"><TextField label="RNC emisor" name="issuerTaxId" /><TextField label="Razón social emisor" name="issuerName" /><TextField label="RNC/cédula receptor" name="buyerTaxId" required={false} /><TextField label="Razón social receptor" name="buyerName" required={false} /><TextField label="Identificación extranjera (si aplica)" name="foreignId" required={false} /></div>
        {type === "E33" && <><p>E33: este pedido debe representar el ajuste comercial, distinto del pedido original.</p><TextField label="ID expediente original conciliado" name="originalCaseId" /><TextField label="Motivo del ajuste" name="adjustmentReason" /></>}
        {source.items.map((item, i) => classificationFields(String(i), `${i + 1}. ${item.name} · ${item.quantity} × ${item.price}`))}
        {source.shippingCost > 0 && classificationFields("shipping", "Transporte")}
        <button disabled={busy} className={buttonStyle}>Preparar sin emitir</button>
      </form>}
    </section>
    <section className="space-y-3"><h2 className="text-lg font-semibold">Expedientes y conciliación</h2>
      <label className="grid gap-1">Estado interno<select className={fieldStyle} value={filter} onChange={e => void refresh(e.target.value)}><option value="">Todos</option>{WORK_STATES.map(s => <option key={s}>{s}</option>)}</select></label>
      <div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Pedido</th><th>Tipo</th><th>e-NCF registrado</th><th>Trabajo interno</th><th>Estado DGII reportado</th></tr></thead><tbody>{rows.map(row => <tr className="border-t" key={row._id}><td className="py-3"><a className="underline" href={`${basePath}/cases/${row._id}`}>{row.orderReference}</a></td><td>{row.type}</td><td>{row.encf ?? "Sin registrar"}</td><td>{row.state}</td><td>{row.officialStatus ?? "No reportado"}</td></tr>)}</tbody></table></div>
      {!rows.length && <p>No hay expedientes para este filtro.</p>}
      <nav className="flex gap-3" aria-label="Paginación de expedientes"><button disabled={page === 1} onClick={() => void refresh(filter, page - 1)}>Anterior</button><span>Página {page}</span><button disabled={!hasNext} onClick={() => void refresh(filter, page + 1)}>Siguiente</button></nav>
    </section>
  </div>;
}
