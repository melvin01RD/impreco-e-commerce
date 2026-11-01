import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { connectDB } from "@/lib/db";
import { requireAdminPageAccess } from "@/lib/access/admin-page-guard";
import { getFiscalTrace } from "@/lib/fiscal/services/queries";
import Link from "@/components/language/link";
import { localeHref } from "@/lib/i18n/locale-routing";

export default async function FiscalTracePage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ afterVersion?: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireAdminPageAccess(locale);
  await connectDB();
  const cursor = Number((await searchParams).afterVersion ?? -1);
  const data = await getFiscalTrace(id, cursor);
  if (!data) notFound();
  return <div className="space-y-6"><h1 className="text-2xl font-semibold">Trazabilidad fiscal · {data.invoice.sourceReference}</h1>
    <dl className="grid gap-2 rounded-lg border p-4"><dt>Tipo / e-NCF</dt><dd>{data.invoice.type} · {data.invoice.encf ?? "Sin asignar"}</dd><dt>Transmisión / estado fiscal</dt><dd>{data.invoice.transmission} · {data.invoice.fiscalStatus}</dd><dt>Ambiente</dt><dd>{data.invoice.environment}</dd><dt>Huella de la instantánea</dt><dd className="break-all font-mono text-xs">{data.invoice.hash}</dd></dl>
    <p className="text-sm text-muted-foreground">La representación impresa autorizada y las operaciones de emisión, ajuste y reconciliación están pendientes de habilitación.</p>
    <ol className="space-y-3">{data.events.map(event => <li key={event.version} className="rounded-lg border p-3 text-sm">{event.occurredAt} · {event.action} · {event.actorId}{event.code ? ` · ${event.code}` : ""}</li>)}</ol>
    {data.nextAfterVersion !== null && <Link className="underline" href={`${await localeHref(locale, `/admin/fiscal/${id}`)}?afterVersion=${data.nextAfterVersion}`}>Ver eventos siguientes</Link>}
  </div>;
}
