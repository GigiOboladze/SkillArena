# CURRENT_STATE — SkillArena

## Hands-on pass on Windows localhost — 2026-11-08

Every feature was used by hand on the owner's Windows machine (`npm run dev`, local `prisma dev`
database) from both sides: admin login/roles, quizzes (create/edit/questions/targeting/results),
students (create/validation/passwords/delete), HootArena (all three question types, reorder, edit,
full live game with a player incl. host and player reloads mid-game, timer auto-reveal, join
errors), legacy self-paced and live homework (join, answer, grade, close, delete), bug reports
with screenshots, INCO, Admin Management, programs/subjects validation, profile username and
password changes, leaderboards. Sandbox suites: **241/241** (`npm run test:all`, production build).

| # | Severity | Bug | Fix |
|---|---|---|---|
| 1 | 🔴 High (local) | "jest worker encountered 2 child process exceptions" when using the site in dev mode: Next's dev static-paths worker imported `@/lib/prisma`, and the Prisma constructor eagerly loads the native query engine in every worker. | `src/lib/prisma.ts` creates the client lazily (Proxy) on first use. |
| 2 | 🟠 Medium (local) | Random 500s - P1001 "Can't reach database server" - under bursts of requests. Measured: `prisma dev` serializes queries and instantly resets any connection beyond its 10th; the app's pool was allowed 10. | `start-local-windows.cmd` runs everything with `connection_limit=5&connect_timeout=0&pool_timeout=0` (read from .env, which is not modified). 0 errors since, incl. 50-request bursts. |
| 3 | 🟠 Medium | Legacy homework questions: points/time limit beyond the Int range (hand-made POST) crashed the action with a 500. | Server clamps to the form's own bounds (1-10000 pts, 5-600 s) and rounds. Grading rounds too. |
| 4 | 🟡 Low | Legacy self-paced homework kept accepting answers after the teacher closed it (only new joins were blocked); a forged option id from another question was stored as the answer. | `submitAsyncAnswer` requires `OPEN` + `ASYNC` and only stores this question's options; the done page says the homework was closed. |
| 5 | 🟡 Low | A finished HootArena game's page still said "Live" and showed its PIN/QR. | Shows "Finished", hides the join code, links to the final results. |
| 6 | 🟡 Low | Tab-switch warnings were swapped: "Final warning" after the 1st switch, the mild warning on the last tolerated one. | Fixed; e2e asserts the sequence. |
| 7 | 🟢 Low | Mobile overflow at 320-360 px: program selector on the admin leaderboard/quizzes, Georgian INCO status labels. | Selector shrinks/truncates; labels wrap. The responsive sweep now runs at 360 px. |

**Performance (list pages):** the leaderboard row markup was slimmed (CSS-drawn icons, avatar
gradient in CSS, no `<!-- -->` text separators): 300-row leaderboard **765 KB → 355 KB** HTML,
render 87 → ~70 ms. Students list forms post the id as a hidden field instead of `.bind()` (no
per-row serialized action args): 1008 → 826 KB. Pixel-identical (screenshot diff).

Local dev note: a 300+-student page takes ~3 s in dev mode on `prisma dev` (PGlite runs Postgres
in WebAssembly and serializes queries) - the same page renders in ~100 ms in production.

## Pre-launch pass — 2026-11-07 (supersedes the 2026-10-14 audit below where they disagree)

**Test status: 236/236 checks pass across all 14 e2e suites** (`npm run test:all`), run twice
back-to-back against a production build with a seeded database, plus the HootArena load test
(50 concurrent players, 7/7). `npx tsc --noEmit` clean; `npx eslint .` 0 errors (1 expected
warning, ThemeInitScript). The "e2e suites unverified" limitation below no longer applies.

### Bugs fixed in this pass
| # | Severity | Bug | Fix |
|---|---|---|---|
| 1 | 🔴 High | Editing a quiz question deleted and re-created its options; `selectedOptionId` is `ON DELETE SET NULL`, so every student's saved answer to that question was erased (mid-quiz answers graded as unanswered; finished results showed "Not answered"). Same in the legacy homework editor. | `src/lib/question-options.ts` updates options in place by position. |
| 2 | 🟠 Medium | HootArena "Move up/down" always failed: a direct order swap violates the non-deferrable `@@unique([gameId, order])`. | Swap through a temporary negative slot. |
| 3 | 🟠 Medium | Legacy LIVE/ASYNC screens treated SkillArena quizzes as ordinary homeworks: `/join/<quiz code>` worked, and any admin could open `/homeworks/<quizId>` and edit/delete another program's quiz, bypassing program scoping. | `canManageHomework` and the join page/action reject `mode === "QUIZ"`. |
| 4 | 🟠 Medium | Public `createHomework` cast the submitted `mode` unchecked (could create `QUIZ` rows or crash on an invalid enum); homework create/join were unthrottled (old finding #6). | Mode validated; per-browser rate limits on create (10/h) and join (20/10 min). |
| 5 | 🟡 Low | A tab-switch report racing a quiz submit could flip a COMPLETED attempt to FAILED (score 0), or a submit could overwrite an auto-fail. | Status changes are conditional on `IN_PROGRESS` (`updateMany`). |
| 6 | 🟡 Low | Admin quiz list and Admin Management scrolled sideways on phones. | Header/action rows wrap. |
| 7 | 🟢 Low | Bug-report status update on a deleted report threw P2025; the attachment route read image bytes before checking access. | Clean 404; auth before reading bytes. |

### Performance
- Session checks: one DB query instead of two, deduplicated per render with React `cache()`
  (layout + page previously repeated them: 4-6 sequential round trips per page).
- Cumulative leaderboard summed by Postgres (`groupBy`) instead of loading every attempt row.
- Quiz eligibility: 1 query instead of 4; independent queries on dashboard, quiz, result and
  admin pages run in parallel; admin layout counts in parallel.
- `loading.tsx` skeletons for `/dashboard` and `/admin`, so navigation paints instantly.
- Geist self-hosted (Latin subset, same size as Google's) - builds no longer depend on Google Fonts.
- Measured on a 300-student / 7,241-attempt dataset with 2.5 ms each-way DB latency, old vs new
  side by side: student dashboard 124→90 ms, leaderboards 161→110 / 174→98 ms, quiz pages ~30%
  faster, admin overview 114→85 ms. Output verified identical (all 314 leaderboard rows).
- **Production finding:** the live site's database round trips are ~1-3 ms (co-located, good),
  but every request from Tbilisi spends ~200 ms in network transit (even a static image). Moving
  the Railway service AND its database to an EU region is the biggest remaining speed lever.

### Still open (product decisions, unchanged)
Old findings #4 (password change needs no current password) and #5 (question timers start when a
question is first viewed) are deliberate behaviours awaiting a product decision. Changing which
option is correct does not re-grade already-submitted attempts.

---

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

## Staff roles, unified login and Staff & Access (2026-11-11)

- **One login** at `/login` for every account. The role is read from the database after the
  password check; students land on `/dashboard`, every staff role on `/admin`. `/admin/login`
  redirects to `/login`. Signing in replaces whatever session the browser had.
- **Roles:** STUDENT, LECTURER, JUNIOR_CAPTAIN, MIDDLE_CAPTAIN, SENIOR_CAPTAIN, SUCCESS_MANAGER,
  SUPER_ADMIN, plus the legacy program-scoped ADMIN (unchanged until the Super Admin reassigns it).
- **Authorization:** `src/lib/authz.ts` (role -> capability, deny by default) and
  `src/lib/scope.ts` (which students / quizzes / INCO rows a role reaches). Every non-Super-Admin
  staff account is walled into its `programId`. `getCurrentAdmin()` still means Super Admin or
  legacy Admin only, so older pages stay closed to the new roles; areas opened to them use
  `getStaffWith(capability)` plus a scope check.
- **Staff & Access** at `/admin/team` (Super Admin only): directory with search, role / program /
  status filters and pagination; role-aware create and edit forms; deactivate / reactivate;
  password reset. **No staff-count limit** (the old `MAX_ADMINS = 8` was removed).
  Role, program, activation and password changes bump `sessionVersion`, ending live sessions.
- **Cohorts** at `/admin/cohorts` (Super Admin): Middle Captains are assigned cohorts, which are
  separate from subject groups.
- **Workspaces:** scoped `/admin/my-students` (+ profile with append-only notes and follow-ups),
  `/admin/supervision` for Senior Captains, program-scoped INCO for Success Managers (new
  messages record the sender's program only - never the student).
- **Migration:** `20261111090000_staff_roles_and_scopes` - additive and idempotent only.
- **Branding:** `public/brand/*` are cleaned transparent PNG derivatives of the supplied logo;
  the originals are kept untouched in `brand-source/`. The supplied SVG only wraps the PNG, so
  there is no true vector version.
