# Backend rules

The backend is the Next.js app itself: route handlers under `src/app/api/`
and server-only code under `src/server/`. There is no separate service. See
`docs/BACKEND_PLAN.md` for the architecture and schema.

## Non-negotiables

Each rule is falsifiable and names its enforcement. A rule without one is a
wish, so if you add a rule here, add its check too.

1. **Layer direction is `lib ← server ← app/api`.** `src/lib/` is pure
   TypeScript (no I/O, no Next, no Mongoose). `src/server/` imports `lib` and
   the database. Route files import `server` and `schemas`, nothing else.
   `src/lib/firebase/*` is browser-only and the only importer of the
   `firebase` client SDK; `firebase-admin` is imported only in
   `src/server/firebase.ts`.
   → every `src/server/*` file starts with `import "server-only"`; a client
   import fails the build. eslint `no-restricted-imports` bans `firebase`
   outside `src/lib/firebase/` and `firebase-admin` outside
   `src/server/firebase.ts`.
2. **Mongoose models and queries live only in `src/server/`.** Route
   handlers and components never import `mongoose` or `src/server/models`.
   → eslint `no-restricted-imports`: `src/components/**`, `src/views/**`,
   `src/api/**`, `src/lib/**` may not import `mongoose`, `firebase-admin` or
   `@/server/*`; `src/app/**` may not import `mongoose` or `@/server/models`
3. **`process.env` is read in exactly one file**, `src/server/config.ts`,
   which validates with zod at boot. Client code sees only `NEXT_PUBLIC_*`,
   and only names on the allow-list in `config.ts` (an unknown one fails
   boot). The browser reads its public values in `src/lib/firebase/client.ts`
   and `src/lib/maps/provider.ts`.
   → eslint `no-restricted-properties` on `process.env` outside those files
   (and `proxy.ts`, NODE_ENV checks); `npm run build` fails if a server
   secret appears in `.next/static` (`scripts/check-bundle-secrets.mjs`)
4. **Every route handler parses input with zod before touching a service**
   (`src/lib/schemas.ts`, shared with the client). Unparsed `request.json()`
   never reaches logic.
   → the service functions take typed inputs; passing `unknown` is a type error
5. **Authorisation happens in `src/server/`, never in a route file or in
   `proxy.ts`.** `proxy.ts` only refreshes the session cookie and redirects
   anonymous users away from private pages; it is UX, not security.
   → each mutating service starts with `requireUser()` / an ownership check
6. **Capacity is enforced by one atomic conditional update**
   (`findOneAndUpdate` with the `goingCount < capacity` condition and `$inc`),
   never by read-then-write. Writes that must move two collections together
   (join + payment, cancel + refunds) run in `session.withTransaction`.
   → `joins.ts` is the only writer of `joins.status` and the activity counts
7. **Webhooks are idempotent and fast.** Verify the signature over the raw
   body (`await request.text()`), `insert … on conflict do nothing` into
   `webhook_events`, return 200 within 5 s, and do the work in `after()`.
   → unique primary key `webhook_events._id = ${provider}:${eventId}`
8. **Every state change writes `audit_log` in the same transaction.**
   → `src/server/audit.ts` takes a transaction handle, never the pool
9. **Expected failures return a coded result, they do not throw.** Codes live
   in `src/lib/errors.ts` (`NOT_LOGGED_IN`, `FULL`, `PAST`, `NOT_VISIBLE`,
   `PAYMENT_REQUIRED`, `CONFLICT` …); responses are `{ code, message }`. The
   frontend branches on `code`, never on `message`. Throwing is for faults.
10. **Shape change = Mongoose schema change + backfill script in the same PR**
    (`scripts/migrate/<date>.mts`, dry run by default, `--apply --target=<db>` to write; delete the script once it
    has run everywhere), plus the schema shown in the plan doc
    (`CLAUDE.md`). No read-time migration, no "handle both shapes".
    → schemas use `strict: "throw"`; an unknown field fails the write
11. **Money is an integer in paise** (`*P` fields). Dates are BSON dates,
    serialised as UTC ISO strings. Never a float, never local time.
    → field naming + zod `.int()`
12. **Soft delete only** for anything referenced (`deleted_at`). Hard deletes
    are forbidden outside migrations and the account-deletion job.
13. **Never log a secret, phone number or OTP.** `src/server/log.ts` redacts.
    The Firebase service-account JSON, Razorpay secrets, the Google
    Maps server key, the Atlas connection string, the job secret and the
    signup-token secret exist only in Vercel env, never in the repo.
    → `.env*` is git-ignored
14. **No outbound I/O inside a transaction** (no Razorpay call, no push, no
    SMS). Fetch and compute first, transact, then fan out with `after()`.
15. **IDs are random prefixed strings** (`u_`, `a_`, `j_` …) from
    `src/lib/ids.ts`, used both internally and in URLs. No serial ids in
    responses.
16. **Public reads are cursor-paginated and capped at 50.** No endpoint
    returns an unbounded collection.
17. **Rate-limit the expensive endpoints**: the Firebase token exchange
    (`POST /api/auth/firebase`), registration, joins, reports, invite opens,
    geo search. → `src/server/ratelimit.ts` is called in each of those services
18. **Firebase is an OTP mechanism, not a login state.** The browser trades
    the Firebase ID token for our session cookie and signs out of Firebase
    straight away; nothing in `src/` reads Firebase user state after login.
    → eslint `no-restricted-syntax` bans `onAuthStateChanged` and
    `auth.currentUser` outside `src/lib/firebase/`
19. **Payments go through a `PaymentGateway`** (`src/server/payments/*`).
    `src/server/payments.ts` holds the provider-agnostic rules and never
    names a provider; refunds use the gateway that took the payment.

## Route handler shape

```ts
// src/app/api/activities/[id]/reviews/route.ts
export function POST(req: NextRequest, ctx: RouteContext<"/api/activities/[id]/reviews">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const input = reviewInput.parse(await readJson(req));   // rule 4
    await addReview(await requireUser(), id, input);         // rule 5 inside
    return json(null);                                       // errors → { error: { code } }, rule 9
  });
}
```

No logic in route files. A handler that outgrows ~40 lines is a sign the
service is missing.

## Module shape (`src/server/`)

| File            | Owns                                        | Must not                       |
| --------------- | ------------------------------------------- | ------------------------------ |
| `db.ts`         | cached `mongoose.connect()`, `withTx()`     | business rules                 |
| `models/*.ts`   | one Mongoose schema + indexes per collection| logic, I/O                     |
| `auth.ts`       | `currentUser()`, `requireUser()`, sessions  | queries beyond users/sessions  |
| `<domain>.ts`   | one domain: activities, joins, payments …   | write another domain's models  |
| `dto.ts`        | doc → DTO mappers; fields enumerated         | expose phone/email outside Me  |
| `notify.ts`     | notification rows + push + realtime fan-out | be called inside a transaction |
| `jobs.ts`       | what `/api/jobs/tick` does                  | be called from a user request  |

A file over ~500 lines is split by subject and keeps its domain name:
`joins.ts`, `joins.waitlist.ts`.

## Testing

- `src/lib/*` and `src/server/*` have Vitest tests. Services run against
  `mongodb-memory-server` in replica-set mode (so transactions work), with
  the database dropped between tests.
- Every capacity path has a concurrency test: N parallel joins against
  capacity M never produce more than M `going` joins.
- Every webhook handler has a duplicate-delivery test and an out-of-order test.
- `npm test` runs Vitest on `mongodb-memory-server`. The Firebase ID-token
  exchange is not unit-tested (it needs the real project); the signup token
  is. Gateways run against a stubbed `fetch` (`src/server/payments.test.ts`).
- Every money path has a test that asserts the sum of ticket, fee, host share
  and refund in paise.
