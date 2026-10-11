# NokNok

Find something to do with the right people. Next.js 16 app that is also its
own backend (route handlers under `src/app/api`, services under `src/server`),
with MongoDB through Mongoose.

## Run it

```bash
npm install
npm run dev        # Firebase Auth emulator + next dev
```

Needs Node 22 and a JDK (17+) for the Firebase emulator.

With no keys at all, `npm run dev` runs on an empty in-memory MongoDB
(replica set, so transactions work; data lives until the server stops), the
Firebase Auth emulator for phone login, OpenStreetMap for maps and the fake
payment gateway. Sign up with any 10-digit number: no SMS is sent, the code
appears on the login screen (and in the `[auth]` log). `/dev` switches
between users, fast-forwards the clock and can delete all data.

With a real Firebase project in `.env.local`, use `npm run dev:next` (no
emulator). Store reviewers use Firebase's "Phone numbers for testing"
(Authentication → Sign-in method → Phone), which take fixed codes and send no SMS.

For a real database copy `.env.example` to `.env.local` and set `MONGODB_URI`
(Atlas, Mumbai region). Collections and indexes are created on first use.

## Checks

```bash
npm run typecheck   # tsc
npm run lint        # eslint
npm test            # vitest inside the Firebase Auth emulator; services on mongodb-memory-server
npm run test:unit   # vitest alone (the emulator-backed auth tests are skipped)
npm run build       # next build, then fails if a server secret is in the bundle
```

Schema changes ship with a script in `scripts/migrate/`; each is a dry run
unless given `--apply`:

```bash
npm run migrate -- scripts/migrate/2026-10-payments-provider.mts --apply
```

## Layout

| Path | What |
|---|---|
| `src/app/` | Pages (thin) and `api/**/route.ts` handlers |
| `src/views/` | The screens, client components over `src/api` hooks |
| `src/components/` | Shared UI |
| `src/api/` | Client data layer: hooks + `Result`-returning actions over `apiFetch` |
| `src/lib/` | Pure helpers, DTO types (`types.ts`), request schemas (`schemas.ts`) |
| `src/server/` | Server-only services, models, auth |
| `docs/` (repo root) | Plans: `BACKEND_PLAN.md`, `PLATFORM_PLAN.md`, `MOBILE_WEBVIEW_PLAN.md` |

Rules for each side live in `AGENTS-B.md` (server) and `AGENTS-F.md` (client).

## Environment

See `.env.example`; every outside service is switched on there, not in code.

| Service | Off (default) | On |
|---|---|---|
| Phone login | Firebase Auth emulator | `NEXT_PUBLIC_FIREBASE_*` + `FIREBASE_SERVICE_ACCOUNT_JSON` |
| Maps | OpenStreetMap + Nominatim | `NEXT_PUBLIC_MAP_PROVIDER=google`, browser key, `GOOGLE_MAPS_SERVER_KEY` |
| Payments | `PAYMENT_PROVIDER=fake` (instant) | `razorpay` or `phonepe` with their keys; `PAYMENT_ENV` = `test` or `live` |

Webhooks: `POST /api/webhooks/razorpay` and `POST /api/webhooks/phonepe`.
Redirect gateways return to `/pay/return`.
