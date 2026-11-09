import { MongoClient } from "mongodb";
import { loadDevEnv, validateDevEnv } from "./lib/dev-env.mjs";
import { diagnoseMongoError } from "./lib/mongodb-diagnostic.mjs";

const env = loadDevEnv();
const errors = validateDevEnv(env);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else if (process.argv.includes("--config-only")) {
  console.log("Configuración DEV válida; secretos omitidos. Base: storify_catalina_dev.");
} else {
  let client;
  let phase = "conexión/autenticación";
  // DNS SRV resolution can outlive the driver's server-selection timeout.
  const deadline = setTimeout(() => {
    console.error(`MongoDB DEV: tiempo agotado (20s), fase: ${phase}. Causa no confirmada; revise DNS, red y acceso Atlas. Sin escrituras.`);
    process.exit(1);
  }, 20000);
  deadline.unref();
  try {
    client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000, connectTimeoutMS: 8000, maxPoolSize: 1 });
    await client.connect();
    phase = "lectura de storify_catalina_dev.settings";
    // Reading an existing collection never creates a database or writes data.
    await client.db(env.MONGODB_DB_NAME).collection("settings").findOne({}, { projection: { _id: 1 }, maxTimeMS: 5000 });
    console.log("MongoDB DEV: lectura correcta en storify_catalina_dev. Sin escrituras.");
  } catch (error) {
    console.error(`MongoDB DEV: fallo de ${diagnoseMongoError(error)} Fase: ${phase}. Detalles sensibles omitidos.`);
    const source = client?.options.credentials?.source;
    console.error(`Origen de autenticación: ${source === "admin" ? "admin" : source === "storify_catalina_dev" ? "storify_catalina_dev" : "otro/no definido (omitido)"}. Base de lectura: storify_catalina_dev.`);
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
    await client?.close();
  }
}
