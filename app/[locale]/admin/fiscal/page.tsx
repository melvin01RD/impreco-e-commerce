import { setRequestLocale } from "next-intl/server";
import { requireAdminPageAccess } from "@/lib/access/admin-page-guard";
import { connectDB } from "@/lib/db";
import { FiscalCase } from "@/models/fiscal-case.model";
import { localeHref } from "@/lib/i18n/locale-routing";
import { ManualWorkbench } from "@/components/admin/fiscal/manual-workbench";
export default async function FiscalPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdminPageAccess(locale);
  await connectDB();
  const rows = await FiscalCase.find().sort({ createdAt: -1, _id: -1 }).limit(25).lean();
  const basePath = await localeHref(locale, "/admin/fiscal");
  return <div className="space-y-6"><h1 className="text-2xl font-semibold">Facturación electrónica DGII · Facturador Gratuito</h1>
    <p>IMPRECO prepara el expediente comercial. La emisión se realiza manualmente en el Facturador Gratuito oficial. No existe envío ni consulta automática desde este flujo.</p>
    <p>Registrar un número no acredita aceptación. La conciliación documenta una revisión humana de evidencia oficial; no es una certificación de IMPRECO.</p>
    <ManualWorkbench initial={JSON.parse(JSON.stringify(rows))} basePath={basePath} />
    <a className="underline" href={basePath + "/legacy"}>Consultar registros fiscales anteriores (solo lectura)</a>
  </div>;
}
