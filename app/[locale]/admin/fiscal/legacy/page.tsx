import { setRequestLocale } from "next-intl/server";
import Link from "@/components/language/link";
import { connectDB } from "@/lib/db";
import { requireAdminPageAccess } from "@/lib/access/admin-page-guard";
import { localeHref } from "@/lib/i18n/locale-routing";
import { fiscalCapabilities, fiscalListSchema, listFiscalDocuments } from "@/lib/fiscal/services/queries";
import { FISCAL_STATES } from "@/models/fiscal-invoice.model";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function FiscalPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdminPageAccess(locale);
  const raw = await searchParams;
  const parsed = fiscalListSchema.safeParse(Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== "")));
  const capabilities = fiscalCapabilities();
  if (!parsed.success) return <p role="alert">Los filtros fiscales no son válidos. <Link href={await localeHref(locale, "/admin/fiscal/legacy")}>Limpiar filtros</Link></p>;
  await connectDB();
  const data = await listFiscalDocuments(parsed.data);
  const pageHref = async (page: number) => {
    const query = new URLSearchParams({ ...parsed.data, page: String(page) } as Record<string, string>);
    return `${await localeHref(locale, "/admin/fiscal/legacy")}?${query}`;
  };
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-semibold">Facturación electrónica DGII</h1><p className="text-sm text-muted-foreground">Comprobantes, estados y trazabilidad de IMPRECO.</p></div>
    <Card><CardHeader><CardTitle>Archivo histórico del adaptador</CardTitle></CardHeader><CardContent className="space-y-3">
      <p>La emisión automática está deshabilitada. Los nuevos expedientes se gestionan manualmente desde <Link className="underline" href={await localeHref(locale, "/admin/fiscal")}>Facturador Gratuito DGII</Link>.</p>
      <p className="text-sm text-muted-foreground">Un pedido pagado y su PDF comercial no acreditan aceptación de la DGII.</p>
      <ul className="grid gap-2 md:grid-cols-2">{capabilities.types.map(item => <li key={item.type} className="rounded-md border p-3 text-sm"><strong>{item.type}</strong> · {item.name}<span className="block text-muted-foreground">No habilitado</span></li>)}</ul>
    </CardContent></Card>
    <form className="flex flex-wrap items-end gap-3" method="get">
      <label className="grid gap-1 text-sm">Pedido o e-NCF<input name="search" defaultValue={parsed.data.search} maxLength={120} placeholder="Referencia exacta" className="rounded-md border bg-background px-3 py-2" /></label>
      <label className="grid gap-1 text-sm">Tipo<select name="type" defaultValue={parsed.data.type ?? ""} className="rounded-md border bg-background px-3 py-2"><option value="">Todos</option>{capabilities.types.map(item => <option key={item.type}>{item.type}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Estado fiscal<select name="status" defaultValue={parsed.data.status ?? ""} className="rounded-md border bg-background px-3 py-2"><option value="">Todos</option>{FISCAL_STATES.map(status => <option key={status}>{status}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Ambiente<select name="environment" defaultValue={parsed.data.environment} className="rounded-md border bg-background px-3 py-2"><option value="sandbox">Sandbox</option><option value="production">Producción</option></select></label>
      <button className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Filtrar</button>
    </form>
    <div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm"><thead><tr className="border-b bg-muted"><th className="p-3">Origen</th><th>Tipo</th><th>e-NCF</th><th>Transmisión</th><th>Estado fiscal</th><th>Error</th></tr></thead><tbody>
      {data.documents.map(async document => <tr key={document.id} className="border-b"><td className="p-3"><Link className="underline" href={await localeHref(locale, `/admin/fiscal/${document.id}`)}>{document.sourceReference}</Link></td><td>{document.type}</td><td>{document.encf ?? "Sin asignar"}</td><td>{document.transmission}</td><td>{document.fiscalStatus}</td><td>{document.errorCode ?? "—"}</td></tr>)}
      {!data.documents.length && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No hay comprobantes para estos filtros.</td></tr>}
    </tbody></table></div>
    <nav aria-label="Paginación fiscal" className="flex gap-4 text-sm">{data.page > 1 && <Link href={await pageHref(data.page - 1)}>Anterior</Link>}<span>Página {data.page}</span>{data.hasNext && data.page < 1000 && <Link href={await pageHref(data.page + 1)}>Siguiente</Link>}</nav>
  </div>;
}
