> **STATUS (2026-11-06): most of this has been FIXED.** This file is the original audit and
> describes the state at commit `0f1d23d`, kept as the historical record and rationale. For what was
> actually changed, why, and the measured results, see `FIXES_APPLIED_2026-11.md` in this folder.

# Testing and Quality Audit

## What I actually ran (2026-11-05)

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | **PASS** — zero errors, `strict: true` |
| Production build | `npx next build` | **PASS** — compiled in ~2.0 s, 61 route entries |
| HootArena scoring unit tests | `npx tsx e2e/hootarena-scoring.mjs` | **PASS — 18/18** |
| ESLint | `npx eslint` | **FAIL — 8 errors, 3 warnings** |
| 11 other e2e suites | `npm run test:e2e*` | **NOT RUN — could not run** (see below) |
| Live DB constraint verification | read-only `pg_indexes` / `pg_constraint` query | **NOT POSSIBLE** (see below) |

**A green build does not mean the features work.** `next build` type-checks and compiles; it executes no
behaviour. Of the 20 findings in `KNOWN_ISSUES_AND_TECHNICAL_DEBT.md`, exactly zero would be caught by
`tsc` or `next build`.

## ESLint failures, in full

Run on **committed** code, which means lint is not in CI and not in a pre-commit hook. `next build` does
not run ESLint in Next 16, which is why a passing build coexists with a failing lint.

```
src/components/CountUp.tsx:15:7          ERROR  react-hooks/set-state-in-effect
src/components/QuizTimer.tsx:24:5        ERROR  react-hooks/set-state-in-effect
src/components/TabSwitchMonitor.tsx:37:5 ERROR  react-hooks/set-state-in-effect
src/components/ThemeToggle.tsx:19:5      ERROR  react-hooks/set-state-in-effect
src/app/admin/(dashboard)/admins/page.tsx:53:81              ERROR  react/no-unescaped-entities
src/app/admin/(dashboard)/students/page.tsx:70:83           ERROR  react/no-unescaped-entities
src/app/admin/(dashboard)/students/SubjectGroupFields.tsx:79:84,97  ERROR  react/no-unescaped-entities (x2)
src/components/ThemeInitScript.tsx:13:5  warn  @next/next/no-before-interactive-script-outside-document
e2e/group-count.mjs:157:9, 158:9         warn  @typescript-eslint/no-unused-vars (x2)
```

The four `set-state-in-effect` errors are all the "sync state from a prop or the DOM" pattern — they work,
but each costs an extra render pass. The `beforeInteractive` warning is a deliberate trade: that strategy
is precisely what prevents the theme flash. The apostrophe errors are cosmetic (`don't` → `don&apos;t`).

## The test suite

12 files, 2,677 lines, **no test framework**. There is no Jest, no Vitest, no Playwright test-runner
config. Each file is a standalone `.mjs` script run through `tsx`, with its own hand-rolled harness:

```js
const results = [];
function ok(name)        { results.push({name, pass: true});  console.log("PASS:", name); }
function fail(name, err) { results.push({name, pass: false}); console.log("FAIL:", name, "-", err); }
async function assert(cond, message) { if (!cond) throw new Error(message); }
```

Consequences of that choice: no parallelism, no retries, no fixtures or isolation, no coverage reporting,
no CI integration, and a failing assertion inside a `try` block is recorded rather than aborting the file.
It is simple and dependency-light, and it clearly worked well enough to drive the development — the
assertion names read like a specification.

### Coverage by suite (~150 recorded checks)

| Suite | L | Covers |
|---|---|---|
| `smoke.mjs` | 249 | Legacy end-to-end: admin login, ASYNC homework creation → join → answer → finish → paragraph grading → leaderboard; LIVE lobby → question → answer → reveal → finish over real sockets. |
| `skillarena.mjs` | 309 | The QUIZ flow: targeting by group, exclusion of non-matching groups **including direct URL**, start→answer→change→refresh→navigate, server-side scoring (2/2), one-attempt lock, tab-switch 1/3 → 2/3 → 3rd fails with score 0, cumulative totals, theme persistence. |
| `hootarena.mjs` | 343 | Full Hoot lifecycle with 4 anonymous players: PIN/QR join, duplicate and case-different nickname rejection, cookie resume, all three question types, the privacy split (students never see the full board), multi-select all-or-nothing, unanswered vs incorrect, finished-game PIN rejection. |
| `hootarena-reconnect.mjs` | 233 | 14 checks using `BrowserContext.setOffline` to drop the real WebSocket: mid-question reconnect keeps the server-authoritative clock, no duplicate player/answer rows, reconnect into REVEAL and LEADERBOARD, "offline exactly when the host advanced", self-reconnect never self-kicks, host reconnect regains control, auto-reveal ≡ manual reveal. |
| `admin-bugreports.mjs` | 332 | Super Admin vs Admin separation (incl. server-side block on `/admin/admins`), the 8-slot cap, Super Admin undeletable, password-change session invalidation; bug reports: magic-byte rejection of a fake `.png`, 2-attachment cap, cross-student isolation, attachment access control. |
| `program-isolation.mjs` | 234 | 16 checks: each admin sees only their own program's students/quizzes/subjects, direct-URL blocks on student detail + quiz manage + quiz results, cross-program student denied even with a matching group *number*, and the DB CHECK constraint rejecting a program-less student. |
| `session-invalidation.mjs` | 153 | Two-device scenarios for both self-service and admin-issued password changes. |
| `group-count.mjs` | 224 | Per-program group counts (4 vs 3), Group IV presence/absence, and rejection of a manipulated `groupId` from another subject/program. |
| `inco.mjs` | 177 | Super-Admin-only access (incl. direct URL), submit → code → anonymous status check → admin response → retrieve, and that a wrong code leaks nothing. |
| `quiz-question-guards.mjs` | 148 | The zero-question publish block and the last-question deletion block. |
| `privacy-and-responsive.mjs` | 160 | Cross-account leakage on the student dashboard, 390px horizontal-overflow checks, no uncaught client JS errors. |
| `hootarena-scoring.mjs` | 115 | **18 pure unit tests** — the only suite needing no server or database. Covers clamping, determinism, monotonicity, all-or-nothing set matching, duplicate-id rejection. |

That is genuinely good behavioural coverage of the *happy paths and the designed guards*, written by
someone who understood the product.

### Why 11 of 12 could not be run

They require **(a)** the app serving at `SMOKE_BASE_URL` (default `http://localhost:3000`) and **(b)** a
reachable database. `DATABASE_URL` in `.env` points at a local `prisma dev` instance on port 51214; a TCP
probe returns `ECONNREFUSED`, so the dev database is not running.

They also **create and delete real rows** — admins, students, quizzes, players — and several carry comments
stating they are safe "against a local dev database only". Pointing them at production is therefore
explicitly not an option, and starting + migrating + seeding a fresh database is precisely what the
investigation rules forbid.

**So their 150 checks are unverified by me.** I read all 12 files and mapped their coverage from source; I
make no claim that they currently pass. The project's own `TESTING_AND_DEPLOYMENT.md` records a prior full
pass, which I can neither confirm nor contradict.

### Phase 3 verification limit
`DATABASE_SCHEMA.md` is derived from `schema.prisma` plus all 12 migration SQL files, read in full. I could
not confirm against a live database that `users_single_super_admin` and `users_program_required_check` are
actually present in the deployed Postgres — they exist only as raw SQL inside migrations and are invisible
to `schema.prisma`. Marked UNVERIFIED there.

## What the suite does *not* cover

**None of the 20 findings has a test.** Specifically missing:

- **All 6 IDOR actions** (S1, S2) — no test ever passes a mismatched (parent, child) id pair. This is the
  single biggest gap, because the bug class is invisible to type checking and to every existing test.
- **Legacy host cross-homework control** (S3) — no test emits a host event with a foreign `homeworkId`.
- **Legacy LIVE reconnect** (F4) — `hootarena-reconnect.mjs` tests this thoroughly for HootArena only;
  nothing exercises `LiveGame`/`HostClient` reconnect, which is exactly where the gap remains.
- **`/admin/students/[id]/attempts/[attemptId]` cross-program access** (S4) — `program-isolation.mjs`
  covers three other direct-URL cases but not this route.
- **Resuming an in-progress attempt from the dashboard** (F1).
- **`totalQuestions` drift** (F2) — no test adds a question to a quiz that already has attempts.
- **HootArena `order` collision** (F3) — no test deletes a middle question and then adds one.
- **Login throttling** (S5) — nothing to test, since none exists.
- **Admin deletion with a hosted Hoot game** (F5).
- **Error-boundary behaviour** (R1) — nothing to test, since none exists.
- **Accessibility** beyond "no horizontal overflow at 390px" and "no uncaught console errors". No axe run,
  no keyboard-only pass, no contrast measurement, no screen-reader check.
- **Load/concurrency.** Nothing exercises 30+ simultaneous HootArena answers or ~350 students hitting the
  leaderboard, which are the two realistic scale risks (R3, R4).
- **Database constraint drift** — no test asserts the two raw-SQL constraints still exist.

### A structural observation
The suite tests **what was built**, not **what could go wrong**. Every assertion maps to an intended
feature or a deliberately designed guard; none probes an unintended path. That is why a 150-check suite
coexists with a one-line-each IDOR family: nothing in the suite ever calls an action with arguments the UI
would not produce. Adding a handful of "call the action directly with a foreign id" tests would have caught
all six.

## Recommendations

**Immediate (cheap, high value):**
1. Add 6 negative tests, one per IDOR action, invoking it with a mismatched child id and asserting the row
   survives. These would have caught the most serious findings in this audit.
2. Fix the 8 lint errors and add `npm run lint` to a CI step — there is no `.github/` at all today.
3. Add `error.tsx` / `not-found.tsx` / `loading.tsx` (R1) and a smoke assertion that a forced error renders
   the branded page.

**Short term:**
4. Extend `program-isolation.mjs` with the attempt-detail URL.
5. Add a legacy-LIVE reconnect test mirroring `hootarena-reconnect.mjs`.
6. Add a `package.json` script that runs all suites in sequence with a single exit code (today each is run
   individually, so there is no one-command gate).

**Worth considering:**
7. Adopt Vitest for the pure-function layer (`scoring`, `hootarena/scoring`, `isSelectionCorrect`,
   `sniffImageContentType`, `computeMultipleChoicePoints`, `hashIncoCode`, `withCappedEntry`) — these need
   no database and would run in milliseconds in CI. `hootarena-scoring.mjs` already proves the value; it is
   the only suite I was able to run.
8. Add a concurrency test for HootArena answers against the real pool limit (R4).
9. Run an accessibility pass with `@axe-core/playwright` inside the existing responsive suite.
