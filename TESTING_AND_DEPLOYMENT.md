# TESTING_AND_DEPLOYMENT — SkillArena

> Audit date 2026-10-14, commit `0f1d23d`. Results marked ✅/❌ were produced by
> running the command during this audit; ⚠️ means not run, with the reason given.

## Commands (`package.json`)

| Script | Command | Notes |
|---|---|---|
| `npm run dev` | `tsx watch server.ts` | **Not `next dev`** — the custom server is required for Socket.IO |
| `npm run build` | `next build` | ✅ verified passing |
| `npm start` | `cross-env NODE_ENV=production tsx server.ts` | Runs TypeScript directly via `tsx` in production — `devDependencies` are deliberately **not** pruned |
| `npm run lint` | `eslint` | ❌ currently 8 errors / 3 warnings |
| `npm run db:migrate` | `prisma migrate dev` | Dev only. Production uses `prisma migrate deploy`. |
| `npm run db:studio` | `prisma studio` | |
| `npm run db:seed` | `tsx prisma/seed.ts` | **Idempotent**, but it writes — not run during this audit |
| `postinstall` | `prisma generate` | Needs the schema present; see Dockerfile notes |

No `tsc` script is defined; type-check with `npx tsc --noEmit` (✅ clean).

## Test suites

**12 Playwright end-to-end suites.** There is **no unit-test runner** (no Jest, no
Vitest) and **no single "run all" script** — each suite is its own npm script:

| Script | File | Covers |
|---|---|---|
| `test:e2e` | `e2e/smoke.mjs` | Legacy LIVE/ASYNC smoke |
| `test:e2e:skillarena` | `e2e/skillarena.mjs` | Student quiz flow end-to-end |
| `test:e2e:admin` | `e2e/admin-bugreports.mjs` | Admin + bug reports (largest, 332 lines) |
| `test:e2e:inco` | `e2e/inco.mjs` | Anonymous feedback + status check |
| `test:e2e:session` | `e2e/session-invalidation.mjs` | `sessionVersion` revocation |
| `test:e2e:privacy` | `e2e/privacy-and-responsive.mjs` | Data privacy + responsive |
| `test:e2e:programs` | `e2e/program-isolation.mjs` | **Cross-program isolation** |
| `test:e2e:quiz-guards` | `e2e/quiz-question-guards.mjs` | Quiz URL/deadline guards |
| `test:e2e:groupcount` | `e2e/group-count.mjs` | Per-program group counts |
| `test:e2e:hootarena` | `e2e/hootarena.mjs` | HootArena full game |
| `test:e2e:hootarena-scoring` | `e2e/hootarena-scoring.mjs` | HootArena points |
| `test:e2e:hootarena-reconnect` | `e2e/hootarena-reconnect.mjs` | Mid-game reconnect |

Fixtures: `e2e/fixtures/test-image.png` and `not-an-image.png` (for the magic-byte
upload rejection test).

### Prerequisites for running them

1. A **running PostgreSQL** reachable via `DATABASE_URL`.
2. Migrations applied and the database **seeded**.
3. **Pre-seeded e2e accounts** the suites expect, e.g. `program-isolation.mjs` needs
   `e2e-test-admin` (Front-end Development) and `e2e-net-admin` (Networks). These are
   *not* created by `prisma/seed.ts`; they must already exist. The suite header notes
   they are pre-seeded because creating a second program-scoped admin through the UI
   requires Super Admin credentials the suite does not hold.
4. The **app running** at `SMOKE_BASE_URL` (default `http://localhost:3000`).
5. `playwright` browsers installed.

The suites **create and delete rows** (each uses a `RUN_ID` to namespace its data) and
connect to Prisma directly as well as driving the browser.

### ⚠️ Status: not run during this audit

`.env`'s `DATABASE_URL` points at **localhost** (a local `prisma dev` instance) and
that database was **not running** — a read-only connection attempt returned
`PrismaClientInitializationError`. Starting a database and running the seed would have
meant writing data, which this audit's constraints excluded, so the suites were skipped
and the limitation recorded instead.

**Consequently the "102/102 passing" figure in older project notes is unverified as of
today.** Re-establishing a green baseline is the recommended first action before any
feature work.

To restore it locally:
```bash
npx prisma dev                 # separate terminal; prints a DATABASE_URL to paste into .env
npm run db:migrate
npm run db:seed                # writes: creates Super Admin + programs/subjects/groups
# then add the e2e admin accounts the suites expect
npm run dev                    # separate terminal
npm run test:e2e:programs      # etc., one script at a time
```

## Environment variables

Six, documented in `.env.example` (values redacted here; `.env*` is gitignored):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string. Keep `pgbouncer=true` and a capped `connection_limit` — poolers reject large pools and Prisma's uncapped default can exhaust them during a live session's query burst. |
| `SHADOW_DATABASE_URL` | Local only, for `prisma migrate dev`. Not needed in production. |
| `ADMIN_USERNAME` | Used **once** by `db:seed` to bootstrap the first Super Admin. |
| `ADMIN_PASSWORD` | Same. Hashed, never stored plaintext. **Should be changed after first login.** |
| `SESSION_SECRET` | HS256 key for the `__session` JWT. `openssl rand -base64 32`. Rotating it invalidates every session. |
| `NEXT_PUBLIC_BASE_URL` | Public URL encoded into join QR codes — must be reachable from student phones. |

Runtime also reads `PORT` (default `3000`) and `HOSTNAME` (default `0.0.0.0`)
(`server.ts:32-33`), plus `__NEXT_PRIVATE_ORIGIN` (set internally — see below).

## Build / start process

```
npm ci                 → postinstall runs `prisma generate`
npm run build          → next build
npm start              → cross-env NODE_ENV=production tsx server.ts
```

`server.ts` creates the HTTP server, wraps Next, and attaches Socket.IO with two
namespaces: the default one (legacy LIVE) and `/hootarena`.

### Two production fixes encoded in `server.ts` — do not remove

1. **Explicit `hostname`/`port` passed to `next({ dev, hostname, port })`** — without
   it, Next's internal self-fetches (e.g. resolving a server action's redirect target)
   assume port 3000 regardless of the real listening port, silently breaking redirects
   whenever `PORT` differs (`server.ts:35-39`).
2. **`__NEXT_PRIVATE_ORIGIN`** — the platform terminates TLS at its edge and forwards
   plain HTTP, so Next's self-fetch would derive an `https://` origin and fail the
   handshake with `ERR_SSL_WRONG_VERSION_NUMBER`, surfacing as **503s on any server
   action ending in `redirect()`**. Setting this env var makes the self-fetch stay on
   plain HTTP in-process (commit `0ff9bd4`, `server.ts:41-52`).

## ⚠️ Hard architectural constraint: single instance only

Both live engines keep game state in **process memory** — `liveStates` and `hootStates`
Maps in `server.ts`. There is no Redis, no Socket.IO adapter, no shared store.

**The app must run as exactly one instance.** With two or more, students and their host
can land on different instances and silently stop receiving updates. The `Dockerfile`
says this explicitly (`--max-instances=1`). Capacity planning is therefore about a
single instance's vCPU/RAM ceiling, **never replica count**.

`src/lib/rate-limit.ts` depends on the same property: its in-memory Map is a real limit
only because there is one process.

## Container image

`Dockerfile` — `node:22-slim`, installs **OpenSSL** (Prisma's query engine needs it or
it guesses a version and misbehaves), copies `package.json`/`prisma`/`prisma.config.ts`
first for layer caching, supplies a **dummy build-time `DATABASE_URL`** so
`prisma generate` can resolve config without connecting, then builds. `EXPOSE 8080`,
`CMD ["npm", "start"]`. `devDependencies` are intentionally kept because `npm start`
runs through `tsx`.

## Deployment configuration — scattered and partly stale

Four targets' configuration coexists in the repo. **This is a real source of
confusion** and worth consolidating:

| Artefact | Target | Status |
|---|---|---|
| `Dockerfile` | Generic container; comments say **Cloud Run** | Current build mechanism; comments outdated |
| `firebase.json`, `.firebaserc`, `firebase-public/` | Firebase Hosting → Cloud Run service `rahoot`, `europe-west1` | **Stale**; `firebase-public/` is empty |
| `deploy/Caddyfile`, `deploy/rahoot.service` | Self-hosted VM: Caddy + systemd | **Stale** (the README's "Oracle Cloud Always Free" path) |
| `neon.ts`, `@neon/config`, `@neon/env`, `.claude/skills/neon-*` | Neon Postgres platform config | Present and plausibly current |
| *(none)* | **No `railway.json` / `railway.toml` / `nixpacks.toml`** | Railway deploys are configured in its dashboard, not in-repo |

The **Firebase artefact explains a load-bearing design decision**: Firebase Hosting
strips every cookie except one literally named `__session` when proxying to Cloud Run,
which is *why* the whole session model is a single `__session` envelope
(`session-core.ts:9-16`). Keep that constraint in mind before "simplifying" the cookie
design, even if Firebase is no longer the host.

**Not verifiable from the repository:** which platform currently serves production, the
live environment-variable values, and the production `connection_limit`. Confirm these
from the hosting dashboard. Prior project notes describe production as **Railway**
(Dockerfile deploy, GitHub-connected auto-deploy on push to `main`) with a Neon/managed
Postgres and a `connection_limit=5` on the app service flagged as a likely bottleneck
under real concurrent load — **treat that as unverified today.**

## Database migration workflow

- Dev: `npm run db:migrate` (`prisma migrate dev`, needs `SHADOW_DATABASE_URL`).
- Production: `prisma migrate deploy`.
- 12 migrations in `prisma/migrations/`. Several carry **hand-written SQL that Prisma's
  schema language cannot express** — the single-Super-Admin partial unique index and
  the `users_program_required_check` CHECK constraint. **Never reset or squash these
  without preserving that SQL**; the schema file alone does not contain it. See
  DATA_MODEL.md.
- `prisma/seed.ts` is idempotent (upserts; skips the admin if any `SUPER_ADMIN` already
  exists — commit `1ea5fc9` fixed it crashing on every deploy when the Super Admin's
  username had been changed via `/admin/profile`).
- `prisma/reset-super-admin.ts` is a **recovery** script, not part of normal operation.

## Outstanding checks

| Check | Status |
|---|---|
| `tsc --noEmit` | ✅ clean |
| `next build` | ✅ passes |
| `eslint` | ❌ 8 errors — must be fixed to restore a green gate |
| 12 e2e suites | ⚠️ not run (no database) — **re-establish baseline first** |
| Browser/visual verification | ⚠️ not done |
| Responsive layout at tablet widths | ⚠️ not done (only `sm:` exists in the code) |
| Dark/light rendering across all routes | ⚠️ not done |
| Tab-switch vs. page-refresh behaviour in a real browser | ⚠️ not done — worth an explicit test |
| Production env vars / `connection_limit` | ⚠️ not verifiable from the repo |
| Load behaviour at ~350 students on one instance | ⚠️ never measured |
