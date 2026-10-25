# NokNok

Find something to do with the right people. Next.js 16 app that is also its
own backend (route handlers under `src/app/api`, services under `src/server`),
with MongoDB through Mongoose.

## Run it

```bash
npm install
npm run dev
```

Needs Node 22.

With no keys, `npm run dev` runs on an empty in-memory MongoDB (replica set,
so transactions work; data lives until the server stops), OpenStreetMap for
maps and the fake payment gateway. Phone login needs the Firebase project in
`.env.local` (`NEXT_PUBLIC_FIREBASE_*` and `FIREBASE_SERVICE_ACCOUNT_JSON`);
without it the login screen reports that phone login is not configured, and
`/dev` switches between seeded users instead. For development and store review
use Firebase's "Phone numbers for testing" (Authentication → Sign-in method →
Phone), which take fixed codes and send no SMS. `/dev` also fast-forwards the
clock, adds test events (three test hosts and sixteen upcoming events, safe to repeat) and can
delete all data.

For a real database copy `.env.example` to `.env.local` and set `MONGODB_URI`
(Atlas, Mumbai region). Collections and indexes are created on first use.

## Checks

```bash
npm run typecheck   # tsc
npm run lint        # eslint
npm test            # vitest; services on mongodb-memory-server
npm run build       # next build, then fails if a server secret is in the bundle
```

Schema changes ship with a script in `scripts/migrate/` (none pending right
now; the folder is deleted once a script has been applied everywhere). Each is
a dry run unless given `--apply`, which also needs `--target=<db>` naming the
database in `MONGODB_URI`, so a stray production string can't be applied to
by habit:

```bash
npm run migrate -- scripts/migrate/<date>.mts                              # dry run
npm run migrate -- scripts/migrate/<date>.mts --apply --target=noknok-dev
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
| Phone login | not configured (use `/dev` to switch users) | `NEXT_PUBLIC_FIREBASE_*` + `FIREBASE_SERVICE_ACCOUNT_JSON` |
| Maps | OpenStreetMap + Nominatim | `NEXT_PUBLIC_MAP_PROVIDER=google`, browser key, `GOOGLE_MAPS_SERVER_KEY` |
| Payments | `PAYMENT_PROVIDER=fake` (instant) | `razorpay` with its keys; `PAYMENT_ENV` = `test` or `live` |

Webhook: `POST /api/webhooks/razorpay`. UPI app switches return to `/pay/return`.
