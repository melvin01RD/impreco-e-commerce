import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { ObjectId, BSON } from "mongodb";
import { hashPassword } from "better-auth/crypto";
import { connectDB, mongoose } from "../lib/db";
import { getStorageConfig, createStorageService } from "../lib/storage";
import { runId, orderId, orderReference, email, password, sequence } from "../e2e/fiscal/fixtures";

const id = runId();
const directory = join(process.cwd(), ".fiscal-test-runs");
const manifestPath = join(directory, `${id}.json`);
type Manifest = { runId: string; users: string[]; orders: string[]; hashes: Record<string, string> };
const digest = (value: unknown) => createHash("sha256").update(BSON.EJSON.stringify(value)).digest("hex");
const fail = (message: string): never => { throw new Error(message); };

async function main() {
  // Do not let fixture setup initialize unrelated application collections/indexes.
  mongoose.set("autoCreate", false);
  process.env.MONGODB_AUTO_INDEX = "false";
  await connectDB();
  const db = mongoose.connection.db!;
  if (db.databaseName !== "storify_catalina_dev") fail("Refusing non-DEV database.");
  const settings = await db.collection("settings").findOne({ key: "singleton" });
  if (!settings?.installedAt) fail("DEV must already be installed; fixtures never install or replace settings.");

  async function cleanup() {
    if (!existsSync(manifestPath)) return;
    const manifest: Manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.runId !== id || manifest.orders.length !== 4 || manifest.users.length !== 2 ||
        !manifest.orders.every(value => ["11", "41", "42", "43"].map(orderId).includes(value)) ||
        !manifest.users.every((value, index) => value === id.slice(0, 20) + ["ff01", "ff02"][index])) fail("Invalid cleanup manifest.");
    const userIds = manifest.users.map(value => new ObjectId(value));
    const orderIds = manifest.orders.map(value => new ObjectId(value));
    const users = await db.collection("user").find({ _id: { $in: userIds } }).toArray();
    const orders = await db.collection("orders").find({ _id: { $in: orderIds } }).toArray();
    if (users.some(user => user.testRunId !== id || ![email("admin"), email("customer")].includes(user.email)) ||
        orders.some(order => order.testRunId !== id || !String(order.orderNumber).startsWith(`TEST-FISCAL-${id}-`))) {
      fail("Ownership check failed; no cleanup performed.");
    }
    const cases = await db.collection("fiscalcases").find({ orderId: { $in: orderIds } }).toArray();
    if (cases.some(item => item.preparedBy !== manifest.users[0] || item.issuerTaxId !== "000000000")) fail("Foreign fiscal case: cleanup refused.");
    const caseIds = cases.map(item => item._id);
    const evidence = await db.collection("fiscalevidences").find({ caseId: { $in: caseIds } }).toArray();
    if (evidence.some(row => row.actorId !== manifest.users[0] || !String(row.key).startsWith(`fiscal-evidence/${row.caseId}/`))) fail("Foreign evidence: cleanup refused.");
    const config = evidence.length ? await getStorageConfig() : null;
    if (config) {
      const storage = createStorageService(config);
      for (const row of evidence) {
        const result = await storage.deletePrivateFile(row.key);
        if (!result.success) fail("Evidence cleanup failed; manifest retained.");
      }
    }
    const changed = orders.some(order => manifest.hashes[String(order._id)] && digest(order) !== manifest.hashes[String(order._id)]);
    // Raw deletion is limited to fixtures, never application paths or real audit.
    for (const name of ["fiscalevidences", "fiscalofficialclaims", "fiscalcaseevents"]) {
      await db.collection(name).deleteMany({ caseId: { $in: caseIds } });
    }
    await db.collection("fiscalcases").deleteMany({ _id: { $in: caseIds }, preparedBy: manifest.users[0] });
    await db.collection("orders").deleteMany({ _id: { $in: orderIds }, testRunId: id });
    await db.collection("session").deleteMany({ userId: { $in: [...userIds, ...manifest.users] } });
    await db.collection("account").deleteMany({ userId: { $in: [...userIds, ...manifest.users] }, testRunId: id });
    await db.collection("auditlogs").deleteMany({ userId: { $in: userIds } });
    await db.collection("user").deleteMany({ _id: { $in: userIds }, testRunId: id });
    unlinkSync(manifestPath);
    if (changed) fail("A synthetic commercial order changed during fiscal tests.");
  }

  if (process.argv[2] === "cleanup") { await cleanup(); return; }
  if (process.argv[2] !== "seed" || existsSync(manifestPath)) fail("Invalid fixture mode or existing manifest; cleanup that run first.");
  // Fiscal uniqueness must already be installed; do not change shared indexes.
  for (const [collection, key] of [
    ["fiscalcases", { issuerTaxId: 1, orderId: 1 }],
    ["fiscalcaseevents", { caseId: 1, version: 1 }],
    ["fiscalcaseevents", { caseId: 1, requestId: 1 }],
    ["fiscalofficialclaims", { issuerTaxId: 1, encf: 1 }],
  ] as const) {
    const indexes = await db.collection(collection).listIndexes().toArray();
    if (!indexes.some(index => index.unique && JSON.stringify(index.key) === JSON.stringify(key))) fail("Required fiscal unique indexes missing; review prepare-fiscal-indexes.ts.");
  }
  const storage = await getStorageConfig();
  if (storage.provider === "local" || !storage.privateBucketName || storage.privateBucketName === storage.bucketName) fail("DEV needs its existing separate private evidence bucket; fixtures do not replace storage settings.");
  const userIds = ["ff01", "ff02"].map(suffix => new ObjectId(id.slice(0, 20) + suffix));
  const suffixes = ["11", "41", "42", "43"];
  const orderIds = suffixes.map(suffix => new ObjectId(orderId(suffix)));
  if (await db.collection("orders").countDocuments({ _id: { $in: orderIds } }) ||
      await db.collection("user").countDocuments({ $or: [{ _id: { $in: userIds } }, { email: { $in: [email("admin"), email("customer")] } }] }) ||
      await db.collection("account").countDocuments({ userId: { $in: [...userIds, ...userIds.map(String)] } }) ||
      await db.collection("session").countDocuments({ userId: { $in: [...userIds, ...userIds.map(String)] } }) ||
      await db.collection("fiscalcases").countDocuments({ orderId: { $in: orderIds } }) ||
      await db.collection("fiscalofficialclaims").countDocuments({ issuerTaxId: "000000000", encf: { $in: ["E32" + sequence("41"), "E32" + sequence("42")] } })) fail("Synthetic identity collision; no writes performed.");
  const manifest: Manifest = { runId: id, users: userIds.map(String), orders: orderIds.map(String), hashes: {} };
  mkdirSync(directory, { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest));
  try {
    const hashed = await hashPassword(password());
    for (const [index, role] of (["admin", "customer"] as const).entries()) {
      const now = new Date();
      await db.collection("user").insertOne({ _id: userIds[index], testRunId: id, name: `TEST-FISCAL ${role}`, email: email(role), emailVerified: true, role, roles: [role], status: "active", createdAt: now, updatedAt: now });
      await db.collection("account").insertOne({ testRunId: id, userId: userIds[index], accountId: String(userIds[index]), providerId: "credential", password: hashed, createdAt: now, updatedAt: now });
    }
    for (const suffix of suffixes) {
      const order = {
        _id: new ObjectId(orderId(suffix)), testRunId: id, orderNumber: orderReference(suffix), customerId: userIds[1],
        items: [{ productId: new ObjectId(), vendorId: new ObjectId(), name: "TEST-FISCAL synthetic product", sku: `TEST-${id}`, price: 100, quantity: 1 }],
        shippingAddress: { fullName: "Synthetic customer", street: "Test", city: "Test", state: "Test", country: "DO", postalCode: "00000" },
        currency: "DOP", subtotal: 100, tax: 18, discount: 0, shippingCost: 0, total: 118, paymentStatus: "paid", paymentMethod: "cod", status: "delivered", subOrders: [], createdAt: new Date(), updatedAt: new Date(),
      };
      await db.collection("orders").insertOne(order);
      manifest.hashes[String(order._id)] = digest(order);
      writeFileSync(manifestPath, JSON.stringify(manifest));
    }
    console.log(`Fiscal DEV fixtures ready; run ${id}. Only synthetic records created.`);
  } catch {
    await cleanup();
    fail("Fixture setup failed; owned records cleaned.");
  }
}

main().catch(() => {
  // Never expose a driver's error, storage credentials or session values.
  console.error(`Fiscal DEV fixtures failed. Run pnpm db:check; verify installation, fiscal indexes and private storage. Retain .fiscal-test-runs/${id}.json if present for controlled cleanup.`);
  process.exitCode = 1;
}).finally(async () => { await mongoose.disconnect(); });
