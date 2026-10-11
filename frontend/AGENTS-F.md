# Frontend rules

**The server is the single source of truth.** Views never re-implement a
business rule that `src/server/` owns (capacity, visibility, refunds, fees)
and never trust client state over server state for anything that matters.
Pure helpers in `src/lib/` may mirror a rule for instant UI feedback, but the
server's answer wins.

`src/api/` is the data layer: hooks (`useSession`, `useActivity`, …) over GET
endpoints and async functions returning `Result<T>` for writes. Views never
know how the data is fetched.

## Non-negotiables

Each rule is falsifiable and names its enforcement. A rule without one is a
wish, so if you add a rule here, add its check too.

1. **Views and components import data only from `src/api`**, never from
   `src/mock`, `src/server` or `fetch` directly. Server components use
   `src/server/*` directly instead. → eslint `no-restricted-imports`
2. **Every backend call goes through `apiFetch`** in `src/lib/api/client.ts`.
   No raw `fetch`, no endpoint strings in components.
   → eslint `no-restricted-globals` on `fetch` outside that file
3. **Request bodies are typed by the shared zod schemas** (`src/lib/schemas.ts`)
   and responses by the DTOs in `src/lib/types.ts`. The server validates every
   body with the same schema, so a shape change fails at the boundary, not as
   `undefined` three components later.
4. **Coded errors get an inline state; only transient failures get a toast.**
   `FULL`, `PAST`, `NOT_VISIBLE`, `PAYMENT_REQUIRED`, `CONFLICT` each have a
   designed UI; a network error gets `toast()`. Branch on `code`, never on
   `message`.
5. **Four states on every data view**: loading (`Skeleton`), error, empty
   (`EmptyState`), loaded. Route level: `loading.tsx` and `error.tsx` per
   segment that fetches.
6. **Filtering, search and pagination are server-side** once the backend
   exists. Never pull a collection into the browser and slice it. Debounce
   search inputs. (The mock layer may filter in memory; keep that inside
   `src/api/queries.ts`.)
7. **Session is an httpOnly cookie read server-side.** No token in
   `localStorage`, React state, a URL or a log. Only `NEXT_PUBLIC_*` env vars
   reach the browser, and no secret ever gets that prefix.
8. **Hidden buttons are never security.** A "host only" control is UX; the
   server checks ownership. Visibility tiers are enforced in `src/server/`;
   `src/lib/visibility.ts` only decides what to render.
9. **Server Components by default.** Add `"use client"` only where
   interactivity requires it and push the boundary down. Pages under
   `src/app/` are thin and render a view from `src/views/`.
10. **Money is integer paise in types and API; rupees only at render** via
    `src/lib/format.ts`. Dates are UTC ISO; converted to local once, at render.
    The client never computes a total the server also computes.
11. **Mobile first.** Every screen works at 360–430 px without horizontal
    scroll, touch targets ≥ 44 px, `env(safe-area-inset-*)` on sticky bars.
    Verified in Chrome device mode before a change is called done.
12. **Native shell awareness goes through `src/lib/native.ts`** (share, push,
    back button, deep links). No direct `@capacitor/*` import elsewhere.
    → eslint `no-restricted-imports`
13. **Colours and spacing come from Tailwind tokens** defined in
    `globals.css`. No literal hex in a component.
14. **Never `dangerouslySetInnerHTML`.** User text (titles, descriptions,
    bios) is rendered as text.
15. **A file is at most 500 lines.** Split views by section
    (`HomeView.tsx` → `HomeRows.tsx`), components by concern.

## Adding a screen

1. Add `src/views/<Name>View.tsx` with the four states (rule 5).
2. Add `src/app/<route>/page.tsx` that renders it; for a dynamic route add
   `generateMetadata` using `src/server/*` directly.
3. If it needs data, add the query/action to `src/api/` first; the view never
   knows whether it is mock or real.
4. If it is private, add it to the redirect list in `proxy.ts` **and** keep
   the server check (rule 8).
5. Check it in Chrome at 390 px and 1280 px.

## Adding an API call

1. Add the body schema to `src/lib/schemas.ts` and the response DTO to
   `src/lib/types.ts`.
2. Add the route handler and service (see `AGENTS-B.md`).
3. Add the hook or request function in `src/api/<domain>.ts` using
   `apiFetch`/`safe`; writes call `invalidateAll()` on success.
4. Add the coded-error UI the view needs (rule 4).
