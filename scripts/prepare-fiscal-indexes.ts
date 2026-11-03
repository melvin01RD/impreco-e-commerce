import { mongoose, connectDB } from "@/lib/db";
import { FiscalInvoice } from "@/models/fiscal-invoice.model";
import { FiscalEvent } from "@/models/fiscal-event.model";
import { FiscalOutbox } from "@/models/fiscal-outbox.model";
import { FiscalSettings } from "@/models/fiscal-settings.model";

async function main() {
  const models = [FiscalInvoice, FiscalEvent, FiscalOutbox, FiscalSettings];
  if (!process.argv.includes("--apply")) {
    for (const model of models) console.log(model.modelName, JSON.stringify(model.schema.indexes()));
    return;
  }
  await connectDB();
  try {
    // createIndexes never drops existing indexes; duplicate data causes a hard failure.
    for (const model of models) { await model.createIndexes(); console.log(`${model.modelName}: indexes ready`); }
  } finally { await mongoose.disconnect(); }
}
main().catch(() => { console.error("Fiscal index preparation failed; review database access and duplicate records."); process.exitCode = 1; });
