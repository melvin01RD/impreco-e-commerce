import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { requireAdminPageAccess } from "@/lib/access/admin-page-guard";
import { connectDB } from "@/lib/db";
import { objectIdSchema } from "@/lib/fiscal/manual/contracts";
import { getCaseDetail } from "@/lib/fiscal/manual/service";
import { NotFoundError } from "@/lib/api/errors";
import { ManualCaseDetail } from "@/components/admin/fiscal/manual-case-detail";
export default async function FiscalCasePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale); await requireAdminPageAccess(locale);
  if (!objectIdSchema.safeParse(id).success) notFound();
  await connectDB();
  let data;
  try { data = await getCaseDetail(id); }
  catch (error) { if (error instanceof NotFoundError) notFound(); throw error; }
  return <ManualCaseDetail initial={data} />;
}
