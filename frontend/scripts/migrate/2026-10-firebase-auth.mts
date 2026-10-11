// PLATFORM_PLAN §2.4: phone login moves to Firebase Auth.
//   otp_codes: dropped (codes and signup tokens now live in Firebase / a signed token)
//   users: + phoneAuthUid (no backfill: set on each user's next login)
//
//   npm run migrate -- scripts/migrate/2026-10-firebase-auth.mts           (dry run)
//   npm run migrate -- scripts/migrate/2026-10-firebase-auth.mts --apply
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
const exists = (await db.listCollections({ name: "otp_codes" }).toArray()).length > 0;
const count = exists ? await db.collection("otp_codes").countDocuments() : 0;
console.log(exists ? `otp_codes holds ${count} documents and will be dropped` : "otp_codes is already gone");

if (apply && exists) {
  await db.dropCollection("otp_codes");
  console.log("Applied.");
} else if (!apply) {
  console.log("Dry run. Re-run with --apply to change the database.");
}
await mongoose.disconnect();
