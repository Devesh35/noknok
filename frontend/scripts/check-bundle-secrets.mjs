// Fails the build if a server secret ended up in the browser bundle
// (PLATFORM_PLAN §9, enforcement 6). Runs after `next build`; CI runs it too.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const STATIC_DIR = ".next/static";
const SECRET_NAMES = [
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "GOOGLE_MAPS_SERVER_KEY",
  "PHONEPE_CLIENT_SECRET",
  "PHONEPE_WEBHOOK_PASSWORD",
  "FIREBASE_SERVICE_ACCOUNT_JSON",
  "JOB_SECRET",
  "SIGNUP_TOKEN_SECRET",
  "MONGODB_URI",
];
// Short values would match by accident; real secrets are long.
const MIN_LENGTH = 8;

const needles = SECRET_NAMES.map((name) => [name, process.env[name]])
  .filter(([, value]) => value && value.length >= MIN_LENGTH)
  .map(([name, value]) => ({ name, value }));
// A service-account key pasted anywhere carries this field name.
needles.push({ name: "a service-account private key", value: '"private_key"' });

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(js|css|html|json|map)$/.test(entry)) yield path;
  }
}

const hits = [];
for (const file of files(STATIC_DIR)) {
  const text = readFileSync(file, "utf8");
  for (const { name, value } of needles) if (text.includes(value)) hits.push(`${name} in ${file}`);
}

if (hits.length) {
  console.error(`Secrets found in the browser bundle:\n  ${hits.join("\n  ")}`);
  process.exit(1);
}
console.log(`check-bundle-secrets: ${needles.length} values checked, none in ${STATIC_DIR}`);
