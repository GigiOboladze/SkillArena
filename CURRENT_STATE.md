# CURRENT_STATE — SkillArena

> Audit date **2026-10-14**. Commit `0f1d23d` on `main`. Working tree **clean**,
> `main` level with `origin/main` (0 ahead, 0 behind). No stashes.
> No application code, data, dependency or configuration was modified by this audit.

## Repository status

| Item | Value |
|---|---|
| Path | `C:\Users\Gigi\Desktop\Rahoot-SkillArena` |
| Branch | `main`, tracking `origin/main`, fully in sync |
| Remote | `https://github.com/GigiOboladze/SkillArena` |
| Uncommitted changes | **none** |
| Last commit | `0f1d23d` — "Rework HootArena to anonymous PIN/QR join, drop program targeting" (2026-10-07) |
| Migrations | 12, latest `20261006120000_hootarena_anonymous_players` |

### Recent history
```
0f1d23d 2026-10-07  Rework HootArena to anonymous PIN/QR join, drop program targeting
ff11b96 2026-10-06  Add HootArena live quiz system, fix reconnect gap, answer-distribution reveal
0ff9bd4 2026-09-23  Fix 503s on server actions that redirect (Next private origin hook)
1ea5fc9 2026-09-23  Fix seed script crashing every deploy when Super Admin username diverges
94f8694 2026-09-23  Fix silent error-swallowing on student profile page
c102b25 2026-09-23  Fix silent error-swallowing on admin profile page; add super admin reset script
cf98dcc 2026-09-21  Fix corrupted postcss.config.mjs breaking the build
```

**Note for anyone resuming from older notes:** the large uncommitted SkillArena diff
that older project notes describe has since been **committed**. The tree is clean.
HootArena is newer than most prior notes, and its latest commit **removed** program
targeting from HootArena.

## Check results (run during this audit)

| Check | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit` | ✅ **clean**, exit 0 |
| Production build | `npm run build` | ✅ **succeeds**, all routes compile |
| Lint | `npx eslint` | ❌ **fails** — 8 errors, 3 warnings |
| E2E (12 suites) | `npm run test:e2e:*` | ⚠️ **not run** — see limitation below |
| Runtime / UI behaviour | — | ⚠️ **not verified** — app not started |

### Lint failures (none are runtime bugs)

4 × `react/no-unescaped-entities` — raw apostrophes in JSX:
- `admin/(dashboard)/admins/page.tsx:53`
- `admin/(dashboard)/students/SubjectGroupFields.tsx:79` (×2)
- `admin/(dashboard)/students/page.tsx:70`

4 × `react-hooks/set-state-in-effect` — a **new React 19 / eslint-config-next rule**
flagging the deliberate "sync state from DOM/props after mount" pattern:
- `components/CountUp.tsx:15`, `QuizTimer.tsx:24`, `TabSwitchMonitor.tsx:37`, `ThemeToggle.tsx:19`

Warnings: `ThemeInitScript.tsx:13` (`beforeInteractive` outside `_document` — expected
for App Router, the strategy is intentional and needed for no-flash theming), and 2
unused vars in `e2e/group-count.mjs`.

These almost certainly appeared when `next`/`eslint-config-next` were upgraded; prior
notes recorded a clean suite. They are cosmetic/stylistic, but they mean **`npm run
lint` is not currently a usable green gate**.

## Audit limitations — stated plainly

1. **The database was unreachable.** `.env` `DATABASE_URL` points at **localhost**
   (a local `prisma dev` instance), which was not running; `PrismaClientInitializationError`
   on a read-only connection attempt. No live data was inspected.
2. **No e2e suite was run.** All 12 suites need a running server **and** a seeded
   database, and they create/delete test rows. Per the audit's own constraints I did
   not start a database or run the seed. **The "102/102 passing" figure in older notes
   is unverified as of today.**
3. **No browser verification.** Nothing below marked "code-inspection" has been
   confirmed against a running UI. Responsive layout, dark/light rendering, timer
   display and the tab-switch behaviour on refresh were **not** visually tested.
4. **Not every file was read.** I read all of `src/lib`, `src/proxy.ts`, the schema,
   all migrations with raw SQL, all authorization guards, the full quiz flow, the
   HootArena answer path, theme and config files. I did **not** read every admin page
   body, every legacy LIVE/ASYNC page, most of `src/components`, the HootArena client
   components in full, or the e2e suites' bodies. `src/generated/prisma` was skipped
   deliberately.

## Confirmed findings, ranked by severity

### 🔴 #2 — No rate limiting on either login action (HIGH)
`src/app/login/actions.ts:6`, `src/app/admin/login/actions.ts:6`

Neither login path calls `checkRateLimit`, although `src/lib/rate-limit.ts` exists and
*is* wired into INCO (5/10 min) and HootArena PIN joins (10/min). Consequences:
- unlimited online password guessing against student **and** admin accounts, including
  the Super Admin;
- because verification is scrypt (deliberately CPU-expensive), a login flood is also a
  **CPU-exhaustion DoS** against a deployment that must run as a **single instance**.

*Status: confirmed by code inspection. Fix is small — the limiter and an anonymous
per-browser key helper already exist.*

### 🟠 #3 — Plaintext passwords transmitted in URL query strings (MEDIUM-HIGH)
`src/app/admin/(dashboard)/students/actions.ts:104, 190, 210` →
rendered at `students/[id]/page.tsx:32, 98-102`

Generated **and admin-chosen** passwords are passed as `?password=<plaintext>`.
They therefore land in: the admin's browser history, the address bar, any
reverse-proxy/platform access log that records query strings, and the `Referer`
header of any subsequent request from that page. Line 210 is especially notable — the
admin typed that password into a form field, and it is then echoed back through a URL.

*Status: confirmed by code inspection. No documented rationale. Needs a POST-render
or short-lived server-side flash instead.*

### 🟠 #1 — Cross-program leak on the student attempt-detail page (MEDIUM)
`src/app/admin/(dashboard)/students/[id]/attempts/[attemptId]/page.tsx`

The page calls **neither `getCurrentAdmin()` nor any program check**. It scopes only
attempt→student (`where: { id: attemptId, studentId: id }`).

- Unauthenticated access **is** blocked — by `src/proxy.ts` and by
  `admin/(dashboard)/layout.tsx:15`, which redirect non-admins.
- But the layout proves only *"some admin is logged in"*. So **any regular Admin can
  read a student from another program's full answer sheet** — every question, the
  student's selection and the correct answer.
- Both sibling pages do this correctly: `students/[id]/page.tsx:51` and
  `students/[id]/edit/page.tsx:30` each run
  `if (admin.role !== "SUPER_ADMIN" && student.programId !== admin.programId) notFound()`.
  This page is the lone outlier, and it violates the standard the codebase states for
  itself (`students/actions.ts:18-26`).

*Mitigating factor:* requires knowing two `cuid`s, which are not practically guessable,
so this is an inconsistency and a defence-in-depth failure rather than a browsable hole.
*Status: confirmed by code inspection.*

### 🟠 #4 — Password change requires no current password (MEDIUM, intentional)
`src/app/dashboard/profile/actions.ts:35`, `src/app/admin/(dashboard)/profile/actions.ts`

Explicitly commented as *"per product requirement"*, and partly mitigated: the change
bumps `sessionVersion` and destroys the current session, forcing a fresh login
everywhere. But anyone with momentary access to a logged-in session — a shared
classroom machine, an unattended browser — can seize the account permanently and lock
the real owner out. This matters more for an **admin** session than a student one.

*Status: confirmed, and confirmed intentional. Flagged for a product decision, not a
silent fix.*

### 🟠 #6 — Unauthenticated, unthrottled homework creation (MEDIUM)
`src/app/homeworks/actions.ts:13`

`createHomework` performs **no authentication** (by design — commit `e7ffae9`, "Public
no-registration homework creation") and is **not rate-limited**. On a public production
URL this is an open database-write endpoint: anyone can create unlimited `Homework`
rows, each consuming a unique `joinCode` from the short code space.

*Status: confirmed by code inspection. Deliberate feature; the missing throttle is the
actual defect.*

### 🟡 #5 — Question timers all start when questions are merely viewed (MEDIUM, fairness)
`src/app/quiz/[id]/q/[index]/page.tsx:28` → `src/lib/quiz.ts:48`

`getOrCreateAttemptAnswer` runs **during page render**, fixing `deadlineAt = now + 100s`
the first time a question is *displayed* — not when answering begins. Because "Next" is
a plain link, a student who clicks through the quiz to read ahead **starts every
question's 100-second clock simultaneously**. Returning to answer can find most
questions already locked.

The start screen says only "You can move between questions and change answers before
you submit" (`quiz/[id]/page.tsx:68-71`) with no warning. The review page does qualify
it. There is also **no overall attempt deadline** — only per-question clocks — so total
wall-clock time per attempt is unbounded.

*Status: confirmed by code inspection; real-world impact not measured. Could plausibly
be the cause of any "students complain they ran out of time" report.*

### 🟡 #8 — Deleting an admin who hosted a HootArena game throws (MEDIUM)
`src/app/admin/(dashboard)/admins/actions.ts:83`

`HootGame.host` is `onDelete: Restrict` (`schema.prisma:531`). `deleteAdminAccount`
calls `prisma.user.deleteMany` with **no try/catch**, and there is **no `error.tsx`
anywhere in the app**. So deleting an admin who has ever created a HootArena game
raises a foreign-key error that surfaces as Next's raw default error screen.

*Status: confirmed by code inspection (not reproduced — no database). Deterministic
given the schema and the absent error handling.*

### 🟡 #9 — No error, not-found or loading boundaries anywhere (MEDIUM)
Verified absent across all of `src/app`: no `error.tsx`, no `global-error.tsx`, no
`not-found.tsx`, no `loading.tsx`. Combined with **zero `try/catch` in any admin or
dashboard server action**, this means:
- every unexpected failure (like #8) renders Next's unstyled default error page;
- `notFound()` is used extensively, so every 404 is the generic off-brand Next page;
- no route has a loading skeleton — navigations block on the server render.

### 🟢 #7 — Theme toggle missing on legacy and HootArena routes (LOW)
`ThemeToggle` appears on the homepage, both logins, `/dashboard`, `/quiz`, `/admin`
and `/inco/status` — but on **none** of `/join`, `/play/*`, `/homeworks/*`,
`/my-homeworks`, or any `/hootarena/*` route. Dark mode still applies (it is the
`:root` default and `ThemeInitScript` is in the root layout), so these pages are not
broken; a student simply cannot switch theme while in a HootArena game or legacy flow.

### 🟢 #10 — `WINDOW_BLUR` is a dead enum value (LOW)
`QuizAttemptEventType.WINDOW_BLUR` is declared (`schema.prisma:40`, migration
`20260913220000`) but **never written**. `reportTabSwitch` (`quiz/[id]/actions.ts:82`)
always logs `TAB_HIDDEN`, so blur-triggered and tab-hidden departures are
indistinguishable in the audit trail — which weakens the evidence available if a
student disputes an auto-fail.

### 🟢 #11 — `getVisibleQuiz` has a misleading name and docstring (LOW)
`src/lib/quiz.ts:13-19` is documented as *"Loads a QUIZ-mode homework the student is
allowed to see (published)"* but filters **only** `id` and `mode: "QUIZ"` — no status,
no eligibility. All five current callers do add the right guards (verified
individually: `quiz/[id]/page.tsx:14,22`, `actions.ts:35,45`, and the `q`/`review`/
`result` pages, which require an existing attempt). So there is **no live
vulnerability** — but the name invites one in the next caller written.

### 🟢 #12 — Lint is red (LOW, process)
See the table above. `npm run lint` cannot currently serve as a CI gate.

## Documentation debt (not code bugs)

- **`README.md` is badly out of date.** It is still the **original pre-SkillArena
  Rahoot README**: titled "# Rahoot", and it documents a *"Notes on the 'no
  authentication' design"* section. It does not mention SkillArena, accounts,
  programs, quizzes, HootArena or INCO. Anyone onboarding from it would be misled.
- **`CLAUDE.md` contained only `@AGENTS.md`**, and `AGENTS.md` holds only Next.js's
  auto-generated agent block. There were no project-specific instructions before this
  audit; one has now been added (see below), preserving the existing import.
- **Deployment configuration is scattered and partly stale** — three parallel targets
  coexist (Firebase/Cloud Run, a Caddy+systemd VM, and the Dockerfile whose comments
  still say Cloud Run) while production actually runs elsewhere. See
  TESTING_AND_DEPLOYMENT.md.
- **Brand naming drift:** every CSS variable is still `--rahoot-red` though the brand
  colour is purple `#7c5cff`; `package.json` name is still `rahoot`.
- **Stray build artefacts** in the working tree (gitignored, harmless):
  seven `src/generated/prisma/query_engine-windows.dll.node.tmp*` files, left by
  interrupted `prisma generate` runs.

## Feature inventory

### Implemented and verified
- Student accounts, admin accounts, single-Super-Admin model (SQL-enforced)
- Two programs with per-program group counts; subjects and groups as real rows
- Per-subject group membership with a distinct "assigned but no group" state
- Program-scoped quiz visibility, enforced at listing **and** at start
- Program-scoped cumulative leaderboards (live-computed, never cached)
- QUIZ mode: single DB-enforced attempt, fixed 100 s/question deadlines immune to
  refresh, back-navigation, server-only scoring in a transaction
- Server-authoritative tab-switch anti-cheat with auto-fail on the 3rd switch
- Revocable stateless sessions via `sessionVersion` (password change signs out every device)
- Quiz CRUD, question reordering, DRAFT→OPEN→CLOSED publish flow with preconditions
- Student CRUD, readable temp passwords, admin-issued resets, program reassignment
- Admin management, capped at 8, Super-Admin-only
- Bug reports with up to 2 magic-byte-validated screenshots stored as DB bytes
- INCO anonymous feedback with structural anonymity and hashed reference codes
- HootArena anonymous PIN/QR live multiplayer with server-authoritative scoring
- Legacy LIVE and ASYNC modes, still functional
- Dark/light theming with no-flash init and `localStorage` persistence

### Partially implemented
- **Responsive design** — only the `sm:` breakpoint exists (39 uses, zero `md:`/`lg:`/`xl:`),
  so tablet and desktop are the same layout. Not visually verified.
- **Anti-cheat audit trail** — events are recorded but not differentiated (#10).
- **Admin subject management** — subjects/groups are created on the Super-Admin-only
  `/admin/programs` surface; regular admins manage students, quizzes and targeting, not
  the subject list.
- **Error/loading UX** — no boundaries at all (#9).

### Contradicted by the current code
- **"Groups are I, II, III; group IV was removed."** Group IV was removed on
  2026-09-19 and then **deliberately restored** on 2026-09-21. Front-end Development
  has **4** groups (I–IV); Networks has 3. See DATA_MODEL.md.
- **"HootArena is program-targeted."** The latest commit explicitly removed program
  targeting; HootArena is now anonymous PIN/QR join with no program, subject or group
  concept.

### Not verified in this audit
- Any runtime/visual behaviour (no DB, no browser)
- The e2e suites' current pass rate
- Whether the refresh-vs-tab-switch distinction holds in a real browser (#5 in BUSINESS_LOGIC.md)
- Live production configuration and data

## Technical debt summary

| Area | Debt |
|---|---|
| Tests | 12 e2e suites but no unit tests; no single "run all" script; no CI config present |
| Lint | 8 errors blocking a green gate |
| Error handling | No boundaries, no try/catch in actions |
| Docs | README describes the wrong application |
| Deploy | Three stale/parallel deployment configs |
| Naming | `rahoot` package name, `--rahoot-red` variables holding purple |
| Schema | `Question.points`/`timeLimitSec` defaults are legacy-only and misleading; one dead enum value |
| Scalability | Single-instance ceiling is architectural (in-memory live state), not tunable |
