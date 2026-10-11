// PLATFORM_PLAN §5.2: payments become provider-agnostic.
//   payments: rzpOrderId → providerOrderId, rzpPaymentId → providerPaymentId,
//             rzpRefundId → providerRefundId, + provider: "razorpay",
//             + merchantOrderId (our id; derived from the payment id)
//   webhook_events: _id "<event id>" → "razorpay:<event id>", + provider
// Old indexes on rzp* are dropped; the app recreates the new ones on start.
//
//   npm run migrate -- scripts/migrate/2026-10-payments-provider.mts           (dry run)
//   npm run migrate -- scripts/migrate/2026-10-payments-provider.mts --apply
import dns from "node:dns";
import mongoose from "mongoose";

const apply = process.argv.includes("--apply");
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Set MONGODB_URI (in .env.local or the environment)");

// Same fallback as src/server/dns.ts: some local DNS proxies refuse SRV queries.
const srv = uri.startsWith("mongodb+srv://") ? new URL(uri).hostname : null;
if (srv) await dns.promises.resolveSrv(`_mongodb._tcp.${srv}`).catch(() => dns.setServers(["8.8.8.8", "1.1.1.1"]));
await mongoose.connect(uri);
const db = mongoose.connection.db!;
const payments = db.collection("payments");
const events = db.collection<{ _id: string; provider?: string }>("webhook_events");

const old = await payments.find({ rzpOrderId: { $exists: true } }).toArray();
const oldEvents = await events.find({ _id: { $not: /:/ } }).toArray();
console.log(`payments to rename: ${old.length}; webhook events to re-key: ${oldEvents.length}`);

if (apply) {
  for (const doc of old) {
    await payments.updateOne({ _id: doc._id }, [
      {
        $set: {
          provider: "razorpay",
          merchantOrderId: { $concat: ["mo_", "$_id"] },
          providerOrderId: "$rzpOrderId",
          providerPaymentId: "$rzpPaymentId",
          providerRefundId: "$rzpRefundId",
        },
      },
      { $unset: ["rzpOrderId", "rzpPaymentId", "rzpRefundId"] },
    ]);
  }
  // A payment that never captured had no rzpPaymentId; don't leave a null
  // behind for the sparse unique index to trip on.
  await payments.updateMany({ providerPaymentId: null }, { $unset: { providerPaymentId: "" } });
  await payments.updateMany({ providerRefundId: null }, { $unset: { providerRefundId: "" } });

  for (const event of oldEvents) {
    await events.insertOne({ ...event, _id: `razorpay:${event._id}`, provider: "razorpay" });
    await events.deleteOne({ _id: event._id });
  }

  const indexes = await payments.indexes().catch(() => []);
  for (const index of indexes) {
    if (index.name && /rzp/.test(index.name)) await payments.dropIndex(index.name);
  }
  console.log("Applied.");
} else {
  console.log("Dry run. Re-run with --apply to change the database.");
}
await mongoose.disconnect();
