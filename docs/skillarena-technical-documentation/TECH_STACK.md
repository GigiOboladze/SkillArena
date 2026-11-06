# Tech Stack (verified from source, not assumed)

All versions below are read from `package.json`; runtime versions from the machine used for this
investigation.

## Core

| Thing | Version | Evidence / note |
|---|---|---|
| Next.js | **16.3.4** | `package.json`. App Router only — no `pages/` dir exists. |
| React / React DOM | **19.2.8** | Enables `useActionState`, `use server` actions. |
| TypeScript | **^5** (`strict: true`) | `tsconfig.json`. `noEmit`, `moduleResolution: "bundler"`. |
| Node | **v24.14.1** local | `Dockerfile` pins `node:22-slim` for prod — **a version skew worth knowing**. |
| Prisma + client | **^6.19.3** | Generated to `src/generated/prisma` (gitignored). |
| PostgreSQL | — | `provider = "postgresql"`. Local dev via `prisma dev`; prod per memory = Railway. |
| Tailwind CSS | **v4** | Via `@tailwindcss/postcss`. **No `tailwind.config.js`** — CSS-first, tokens in `src/app/globals.css` under `@theme inline`. |
| Socket.IO server + client | **^4.8.3** | Two namespaces: default (legacy LIVE) and `/hootarena`. |
| jose | **^6.2.12** | HS256 JWT signing for the session envelope. **No NextAuth.** |
| nanoid | **^6.0.1** | Custom alphabets for join codes, client tokens, INCO codes, temp passwords. |
| qrcode | **^1.5.4** | Server-side QR PNG data URLs. |
| server-only | **^0.0.1** | Guards server modules from client import. |

## Dev / tooling
`playwright ^1.63.0` (used directly in scripts — **no test runner**), `tsx ^4.23.13` (runs `server.ts` and
all tests), `cross-env`, `eslint ^9` + `eslint-config-next 16.3.4`, `@types/*`.

**There is no Jest, Vitest, or Playwright test-runner config.** Every "test" is a standalone `.mjs` script
with its own hand-rolled `ok()`/`fail()` tally. See `TESTING_AND_QUALITY_AUDIT.md`.

## Rendering & architecture choices

- **App Router, server-first.** Nearly every page is an async Server Component that queries Prisma
  directly. `next build` reports **61 route entries: 57 dynamic (ƒ), 4 static (○)**. The only static ones are
  `/_not-found`, `/icon.png`, `/apple-icon.png` and `/inco/status`.
- **`"use client"` is used sparingly** — 28 client modules, almost all for a specific reason: a socket
  connection, a timer, a `window.confirm` gate, or `useActionState`.
- **Mutations are Server Actions**, not API routes. There is exactly **one** route handler in the whole app:
  `src/app/attachments/[id]/route.ts` (streams bug-report image bytes, which an action cannot do).
- **Custom server, not `next start`.** `server.ts` creates the HTTP server, attaches Socket.IO, and hands
  everything else to Next's request handler. This is mandatory for WebSockets.
- **`src/proxy.ts` is the middleware.** Next 16 renamed `middleware.ts` → `proxy.ts`; the build output
  confirms it as "ƒ Proxy (Middleware)".

## Two platform workarounds worth understanding

Both are load-bearing, and both are documented in-source:

1. **One cookie named `__session`** (`src/lib/session-core.ts:9-16`). Firebase Hosting, when proxying to
   Cloud Run, strips every cookie except one literally named `__session`. So admin, student, legacy
   per-homework, creator and HootArena-player sub-sessions are all packed into a single signed JWT
   envelope. *Caveat:* the INCO/Hoot rate-limit cookies (`inco_rl`, `hoot_rl`) are separate names and
   would be stripped on that path — harmless on Railway, see `SECURITY_AUDIT.md`.
2. **`__NEXT_PRIVATE_ORIGIN`** (`server.ts:53`). On Railway, Next's internal self-fetch for resolving a
   Server Action's `redirect()` derived an `https://` origin from forwarded headers, but Railway terminates
   TLS at the edge and forwards plain HTTP → `ERR_SSL_WRONG_VERSION_NUMBER` → server actions that end in
   `redirect()` returned 503. Setting this env var pins the self-fetch to `http://127.0.0.1:$PORT`.

## Deployment

Current host (per project memory, not verifiable from source): **Railway**, Dockerfile-based, auto-deploy on
push to `main`. `npm start` = `tsx server.ts` — TypeScript is executed directly in production via `tsx`;
devDependencies are deliberately **not** pruned in the image because of that (`Dockerfile` comments say so).

**Three generations of deploy config are still in the repo**, only one of which is live:
- `Dockerfile` — current (Railway/Cloud Run). Notes `--max-instances=1`.
- `firebase.json` + `.firebaserc` — Firebase Hosting → Cloud Run (`serviceId: rahoot`, `europe-west1`). Retired, but it is the reason for the `__session` constraint above.
- `deploy/Caddyfile` + `deploy/rahoot.service` — Oracle VM with Caddy + systemd. Retired.

### The single-instance constraint
`server.ts` holds `liveStates` (line 77) and `hootStates` (line 137) in plain `Map`s, and
`src/lib/rate-limit.ts` holds its counters in a module-level `Map`. **None of this is shared.** Running two
replicas would route a student to a different process than their host, and they would silently stop
receiving game events. Scaling is vertical only.

## Environment variables

Names only (values never printed). From `.env.example` + the live `.env` key list:

| Var | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | Prisma everywhere | Keep `pgbouncer=true` (disables prepared-statement caching) and a capped `connection_limit`. |
| `SHADOW_DATABASE_URL` | `prisma migrate dev` only | Local only; `migrate deploy` doesn't need it. |
| `SESSION_SECRET` | `session-core.ts:28` | HS256 key. **Throws at runtime if unset.** Rotating it logs everyone out. |
| `ADMIN_USERNAME` / `ADMIN_EMAIL`, `ADMIN_PASSWORD` | `prisma/seed.ts`, `prisma/reset-super-admin.ts` | Bootstrap only, and the e2e suites authenticate with them. |
| `NEXT_PUBLIC_BASE_URL` | `src/lib/qr.ts:4` | Baked into QR codes — **if wrong, every QR points somewhere unreachable.** Falls back to `http://localhost:3000`. |
| `PORT`, `HOSTNAME`, `NODE_ENV` | `server.ts:32-34` | Platform-injected. |

## Notable absences (all deliberate or at least consistent)
No NextAuth · no bcrypt (scrypt from `node:crypto` instead) · no Zod/validation library (hand-rolled
`String(formData.get(...))` parsing throughout) · no Redis (in-memory limiter, justified by single-instance)
· no state manager (Redux/Zustand) and **no React Context anywhere** — server-side data fetching removes the
need · no logging library (`console.log`/`console.error` only) · no error monitoring (no Sentry) · no CI
config (`.github/` does not exist).
