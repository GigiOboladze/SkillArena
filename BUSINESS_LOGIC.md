# BUSINESS_LOGIC — SkillArena

> Each rule below is marked **VERIFIED** (read in the code, with file:line),
> **CONTRADICTED** (the code does something different from the stated history),
> **PARTIAL**, or **NOT VERIFIED** (could not be confirmed in this audit).
> Audit date 2026-10-14, commit `0f1d23d`.

## Roles and permissions

`UserRole` = `SUPER_ADMIN` | `ADMIN` | `STUDENT` (`prisma/schema.prisma:20`).
There is one `User` table for all three; students and admins differ only by role.

| Rule | Status | Evidence |
|---|---|---|
| Exactly one Super Admin, ever | **VERIFIED** — enforced in SQL, not just app code | partial unique index, `migrations/20260916120100/migration.sql:15` |
| `SUPER_ADMIN` never assignable via UI | **VERIFIED** | `admins/actions.ts:50` always creates `role: "ADMIN"`; no code path writes `SUPER_ADMIN` except the seed |
| Super Admin cannot be deleted or reassigned | **VERIFIED** — structurally, via `role: "ADMIN"` filters | `admins/actions.ts:64, 83` |
| Max 8 admins | **VERIFIED** — server-side, counts `ADMIN` + `SUPER_ADMIN` | `MAX_ADMINS = 8` (`src/lib/admin-constants.ts`), checked at `admins/actions.ts:42` |
| Each regular Admin assigned to exactly one program | **VERIFIED** — app + SQL `CHECK` | `admins/actions.ts:34`; `users_program_required_check` |
| Super Admin has no program (sees all) | **VERIFIED** | same `CHECK` requires `programId IS NULL` for `SUPER_ADMIN` |
| Super Admin manages programs | **VERIFIED** | `/admin/programs`, `programs/actions.ts:8` `requireSuperAdmin` |
| Super Admin switches program context | **VERIFIED** | `resolveAdminProgramScope` (`src/lib/programs.ts:21`) + `ProgramSelector` component |
| Admins manage subjects/groups in their program | **PARTIAL** — subjects are created under `/admin/programs` (Super-Admin-only). Regular admins manage *students, quizzes and targeting* within their program, not the subject list itself. | `programs/actions.ts` is `requireSuperAdmin`-gated throughout |
| Admin-level distinction is a post-login permission check, not a separate login | **VERIFIED** | one shared form; `verifyAdminCredentials` accepts both (`session.ts:42`) |

### Program-scoping mechanism

`resolveAdminProgramScope(admin, requested)` (`src/lib/programs.ts:21`):
- regular `ADMIN` → **always** their own `admin.programId`; a `?program=` query
  param is **ignored entirely** (never trust a client-supplied program id);
- `SUPER_ADMIN` → may pick any real program via `?program=`, validated against the
  DB, falling back to the first by `order`.

Scoping is re-checked at every mutation through per-resource guards, not by relying
on list filtering. The codebase states this explicitly: *"hiding another program's
students from a list is not what makes this safe"* (`students/actions.ts:18-26`).

- `requireAdminForStudent` (`students/actions.ts:27`) — program check at line 31.
- `requireQuizAccess` (`quizzes/actions.ts:23`) — program check (via `quiz.subject.programId`) at line 29.
- `canAdminManageGame` (`src/lib/hootarena/access.ts`) — **ownership**-based, not program-based, because HootArena has no program concept.

⚠️ **One verified gap:** `/admin/students/[id]/attempts/[attemptId]` performs
**no admin and no program check** of its own. See CURRENT_STATE.md finding #1.

## Programs and student assignment

| Rule | Status | Evidence |
|---|---|---|
| Two programs: Front-End Development and Networks | **VERIFIED** | `prisma/seed.ts:15-41` |
| Programs are DB rows, not an enum — new ones addable without code change | **VERIFIED** | `Program` model; `groupCount` is per-program data |
| Each student belongs to exactly one program | **VERIFIED** — SQL `CHECK` makes it impossible to omit | `users_program_required_check` |
| Students with no program have no quiz access | **VERIFIED (but unreachable)** — the guard exists at `dashboard/page.tsx:11` and `subjects.ts:53`, yet the SQL `CHECK` means a `STUDENT` row can never have a null `programId`. The real "no access" state is *no group*. | see DATA_MODEL.md |
| Students see only their own program's quizzes | **VERIFIED** — twice | `eligibleHomeworkWhere` requires `subject: { programId: student.programId }` (`subjects.ts:58`); `isStudentEligibleForQuiz` re-checks `student.programId !== subject.programId` (`:86`) |
| Leaderboards separated by program | **VERIFIED** | `getCumulativeLeaderboard(programId)` (`quiz.ts:94`) filters both the roster *and* the attempts by program |
| Student groups are I, II, III; group IV removed | **CONTRADICTED** | Group IV was removed on 2026-09-19 then **deliberately restored** on 2026-09-21. Front-end Development has **4** groups (I–IV); Networks has 3. See DATA_MODEL.md § Group counts. |
| One group per subject per student | **VERIFIED** — DB-enforced | `@@unique([studentId, subjectId])` |
| A student can be in different groups across different subjects | **VERIFIED** | same unique key is per-(student, subject), not per-student |
| "Assigned to subject but no group yet" is a real state | **VERIFIED** | `groupId` nullable (`migrations/20260919091500`); surfaced via `getUngroupedSubjectAssignments` (`subjects.ts:100`), grants **no** quiz access |

## Quiz rules (QUIZ mode / SkillArena)

All fixed in `src/lib/quiz-constants.ts` — **not admin-configurable**:

```ts
QUIZ_QUESTION_POINTS           = 1    // one point per correct answer
QUIZ_QUESTION_TIME_LIMIT_SEC   = 100  // per question
QUIZ_MAX_TAB_SWITCHES          = 2    // the 3rd detected switch fails the quiz
```

| Rule | Status | Evidence |
|---|---|---|
| 1 point per correct answer | **VERIFIED** | constant above; `score += 1` at `quiz/[id]/actions.ts:118` |
| Students may navigate back and change answers before submitting | **VERIFIED** | "Previous" link, `quiz/[id]/q/[index]/page.tsx:83-89`; re-selection allowed while that question's deadline holds |
| One attempt per student per quiz | **VERIFIED** — DB-enforced, not just app logic | `@@unique([studentId, homeworkId])`; `startOrGetAttempt` (`quiz.ts:32`) relies on it for concurrency safety |
| Timer cannot be reset by refreshing or revisiting | **VERIFIED** | `deadlineAt` fixed at row creation via `upsert` with empty `update: {}` (`quiz.ts:48-58`) |
| Scoring happens server-side, only at submission | **VERIFIED** | `submitQuizAttempt` (`quiz/[id]/actions.ts:103-134`); `AttemptAnswer.isCorrect` stays `null` until then |
| Correctness never revealed mid-quiz | **VERIFIED** | the question page never reads `isCorrect`; review page shows only the student's own selection |
| Answers past the deadline are rejected | **VERIFIED** — server-side, silently ignored | `quiz/[id]/actions.ts:57-63` |
| Scoring/submission wrapped in a transaction | **VERIFIED** | `prisma.$transaction` at `:124` |
| Publishing requires subject + ≥1 target group + ≥1 question | **VERIFIED** | `setQuizStatus` (`quizzes/actions.ts:120-133`), with a comment explaining the zero-question trap it prevents |
| Quiz questions have exactly 4 options, exactly 1 correct | **VERIFIED** | `parseQuizQuestionForm` (`quizzes/actions.ts:148-163`) |
| Publish flow DRAFT → OPEN → CLOSED | **VERIFIED** | `HomeworkStatus`; students only see `status: "OPEN"` (`dashboard/page.tsx:28`, `quiz/[id]/page.tsx:14`) |

### Anti-cheat (tab-switch detection)

| Rule | Status | Evidence |
|---|---|---|
| Detects repeated tab/window switching | **VERIFIED** | `TabSwitchMonitor` listens to `visibilitychange` **and** `blur`/`focus` |
| 3rd switch fails the attempt, score 0 | **VERIFIED** | `reportTabSwitch` (`quiz/[id]/actions.ts:85-98`): `> QUIZ_MAX_TAB_SWITCHES` → `status: "FAILED"`, `score: 0` |
| Server-side enforcement (client not trusted) | **VERIFIED** | the count and the fail decision both live in the server action; the client only renders what it returns |
| One departure counts once (no double-count when blur + visibilitychange both fire) | **VERIFIED** | `awayRef` latch, `TabSwitchMonitor.tsx:42-43`, reset on focus/visible |
| Refreshing must not count as cheating | **PARTIAL / NOT BROWSER-VERIFIED** | No refresh-specific handling exists. Reload normally fires `pagehide`/`unload` rather than `blur`-while-visible, so it *should* be safe, and the count is re-read from the server on remount. But the `onBlur` path (`:61-65`) fires whenever the window blurs while still visible, and this was **not verified in a real browser** during this audit. Worth an explicit test. |
| Failure is audit-logged | **PARTIAL** | `QuizAttemptEvent` rows are written, but always as `TAB_HIDDEN`; `WINDOW_BLUR` is never used, so blur and tab-hide are indistinguishable after the fact |

**Known limits of the technique** (documented honestly in the component itself):
it cannot see activity outside the browser, and a second physical device defeats it.

### Timer behaviour worth flagging

The 100-second clock for a question starts when that question's page is **first
rendered** (`getOrCreateAttemptAnswer` is called during render,
`quiz/[id]/q/[index]/page.tsx:28`). Consequences:

- There is **no overall attempt deadline** — only per-question clocks.
- A student who clicks "Next" through the whole quiz to read ahead **starts every
  question's timer concurrently**, and those clocks keep running. Coming back to
  answer later can find several questions already locked.
- The start screen promises "You can move between questions and change answers
  before you submit" (`quiz/[id]/page.tsx:68-71`) without mentioning this. The
  review page *does* qualify it ("as long as that question's timer hasn't run out").

This is a design consequence, not a crash — but it is a fairness/UX risk. Recorded
as finding #5 in CURRENT_STATE.md.

## Authentication and sessions

**No NextAuth.** A hand-rolled JWT envelope in a **single cookie named `__session`**.

Why one cookie: Firebase Hosting strips every cookie except one literally named
`__session` when proxying to a Cloud Run backend (`session-core.ts:9-16`). The app
needs several concurrent sub-sessions, so they all live in one signed envelope.

**Envelope contents** (`session-core.ts:50-63`):

| Key | Meaning | TTL |
|---|---|---|
| `admin` | admin account sub-session | **12 h** |
| `studentUser` | SkillArena student account | **14 days** |
| `students` | legacy anonymous per-homework joins (map, cap 15) | envelope TTL |
| `creators` | legacy no-login homework ownership (map, cap 15) | envelope TTL |
| `hootPlayers` | HootArena anonymous players (map, cap 15) | envelope TTL |

Outer JWT TTL: **30 days**, HS256, signed with `SESSION_SECRET`. Maps are capped
(oldest evicted) to stay under the ~4 KB cookie limit.

| Rule | Status | Evidence |
|---|---|---|
| Passwords hashed with scrypt, constant-time compare | **VERIFIED** | `src/lib/password.ts`; `timingSafeEqual` |
| No bcrypt dependency | **VERIFIED** | not in `package.json` |
| Password change signs the account out on **every** device | **VERIFIED** | `sessionVersion` incremented on change; `getAdminSession`/`getStudentUserSession` compare the JWT's embedded `sv` against the DB on **every request** (`session.ts:75-81, 96-102`) |
| Admin-issued password reset also invalidates sessions | **VERIFIED** | `resetStudentPassword` / `setStudentPassword` both increment `sessionVersion` |
| Defense in depth: middleware + layout + action | **VERIFIED** | `src/proxy.ts` gates the trees; every `layout.tsx` re-checks; every action re-checks |
| Open-redirect protection on login `from` param | **VERIFIED** | `from.startsWith("/dashboard")`/`("/quiz")`/`("/admin")` checks (`login/actions.ts:20`, `admin/login/actions.ts:20`) |
| Role confusion prevented | **VERIFIED** | `getCurrentStudent` requires `role === "STUDENT"`; `getCurrentAdmin` requires `ADMIN`/`SUPER_ADMIN` |
| Changing password requires the current password | **NO — intentional** | Neither `dashboard/profile/actions.ts:35` nor `admin/(dashboard)/profile/actions.ts` verifies the old password. Commented as *"per product requirement"*, mitigated by forcing an immediate re-login. **Still a real account-takeover risk on an unattended logged-in device** — finding #4. |
| Login is rate-limited | **NO** | `rate-limit.ts` exists and is used for INCO and HootArena, but **not** for either login action — finding #2. |

**Middleware caveat:** `src/proxy.ts` validates only the JWT signature and expiry.
It cannot check `sessionVersion` (no DB access at that layer), so a just-invalidated
session passes the middleware and is rejected one layer deeper. Correct by design,
but means the middleware alone is not an authorization boundary.

## Administration

| Rule | Status | Evidence |
|---|---|---|
| Super Admin creates/removes admins | **VERIFIED** | `/admin/admins`, every action `requireSuperAdmin`-gated |
| `/admin/admins` 404s for regular admins even by direct URL | **VERIFIED** | `admins/page.tsx` uses `getCurrentSuperAdmin()` + `notFound()` |
| INCO admin surface is Super-Admin-only | **VERIFIED** | `inco/page.tsx:18-19`; the layout also hides the nav link *and* skips the unread count so a regular admin gets no hint the feature exists (`layout.tsx:22-26`) |
| Admin-chosen passwords ≥ 8 chars | **VERIFIED** | `admins/actions.ts:29`, `students/actions.ts:201`, both profile actions |
| Auto-generated temp passwords are readable (no look-alike chars) | **VERIFIED** | `nanoid` custom alphabet, 10 chars, excludes `0/O/1/I/l` (`students/actions.ts:35`) |
| Student profile shows personal details, program, memberships, total score, completed count | **VERIFIED** | `/dashboard/profile`, `/dashboard` stat cards (`dashboard/page.tsx:60-73`) |
| Per-question correctness visible to admins | **VERIFIED** | `/admin/students/[id]/attempts/[attemptId]` renders each question, the student's choice and the correct option |
| Students cannot see other students' results | **VERIFIED** | every attempt query is keyed by the session's own `student.id`; the leaderboard exposes only name + total + count |
| Deleting a quiz warns about destroying attempts | **VERIFIED** | explicit `window.confirm` text in `DeleteQuizButton.tsx` |
| Temp passwords are disclosed via URL query string | **YES — a weakness** | `?password=...` in three redirects (`students/actions.ts:104, 190, 210`) — finding #3 |

## Other features

### Bug reports — **VERIFIED, fully implemented**
- Required description, max 2000 chars; **up to 2 optional screenshots**, 3 MB each
  (`src/lib/bug-reports.ts:3-5`) — matches the stated requirement exactly.
- Content type determined by **magic bytes**, never the extension or `File.type`
  (`sniffImageContentType`): PNG, JPEG, GIF, WEBP. Anything unrecognised is rejected.
- Stored as DB `Bytes`; served by `/attachments/[id]`, which authorizes itself
  (not covered by middleware) and returns an identical 404 for "missing" and
  "forbidden" so ids cannot be probed.
- Statuses: `OPEN` / `IN_PROGRESS` / `RESOLVED`.
- **Deliberately not program-scoped**: any logged-in admin may read any report
  (documented at `attachments/[id]/route.ts:5-9`). Consistent across the feature.
  Confirm this is intended, since it does expose other programs' student names.

### INCO (anonymous feedback) — **VERIFIED, fully implemented**
- 9 categories, Georgian labels; statuses `NEW` / `IN_PROGRESS` / `RESOLVED` plus an
  optional `response`.
- Submitted from `/dashboard/inco` (login required to reach the page) but the row
  carries **no author link whatsoever** — anonymity is structural, not policy.
- Student receives a 20-character reference code (~117 bits entropy), formatted in
  5 groups; only its SHA-256 hash is stored. Status checked at the **public**
  `/inco/status`.
- Rate-limited 5 submissions / 10 min and 10 status checks / 10 min, keyed by an
  **anonymous per-browser cookie rather than IP**, precisely to avoid
  quasi-identifying the sender.

### Dark / light mode — **VERIFIED**
- **Dark is the default**; light is opt-in via `html[data-theme="light"]`.
- Persisted in `localStorage` under `skillarena-theme`; applied by a
  `beforeInteractive` script before first paint, so there is no theme flash
  (`ThemeInitScript.tsx`).
- Tokens defined twice in `globals.css` — `:root` (dark, line 18) and
  `:root[data-theme="light"]` (line 55).
- **Does not follow the OS `prefers-color-scheme`** — there is no such media query
  for colours (only for `prefers-reduced-motion`, lines 175/190). Deliberate, but
  means a light-mode-preferring user still lands on dark first.
- Toggle present on: homepage, both logins, student dashboard, quiz, admin
  dashboard, `/inco/status`. **Absent** from all legacy routes and all HootArena
  routes — finding #7.
- Brand colour is now **purple `#7c5cff`**, although every CSS variable is still
  named `--rahoot-red`. Naming debt only, no functional effect.

### Responsive layout — **PARTIAL**
Only the `sm:` breakpoint is used anywhere (39 occurrences; zero `md:`, `lg:`, `xl:`).
There are effectively **two layout tiers** — below and above 640 px — so tablet and
desktop render identically. Fine for the stated use case, but it is not a
three-tier desktop/tablet/mobile design. Not visually verified in this audit.

### QR codes — **VERIFIED present**
`src/lib/qr.ts` + `qrcode` dependency; used for legacy LIVE join and for HootArena
PIN joins. `NEXT_PUBLIC_BASE_URL` must be reachable from student devices.

### HootArena — **VERIFIED, and newer than any prior project notes**

The two most recent commits (2026-10-06/07) added HootArena and then **reworked it
to anonymous PIN/QR join, dropping program targeting**. Current rules:

- Players join by **6-digit PIN** with a **self-chosen nickname** and **no account**;
  identity is an opaque `clientToken` cookie. Access control is "whoever the host
  shares the PIN with" — the same trust model as legacy LIVE mode.
- **No program/subject/group targeting at all.** Any earlier note describing
  HootArena as program-targeted is out of date.
- Fixed **20 s per question**; `SINGLE_CHOICE`, `MULTIPLE_CHOICE` (all-or-nothing),
  `TRUE_FALSE`.
- Admin side stays account-based: a regular Admin manages games they created, Super
  Admin any game (`canAdminManageGame`) — ownership, not program.
- Answer handling is server-authoritative and well guarded (`server.ts:1091-1145`):
  identity from `socket.data` (fixed at join, never re-read from the event payload),
  a server-side deadline check independent of phase (+500 ms grace), option ids
  validated against the question, in-memory dedup set, and
  `@@unique([playerId, questionId])` as the final backstop across restarts.
- Reconnect is idempotent via `@@unique([gameId, username])` + `clientToken`.
- PIN joins are rate-limited (10/min per browser).

### Legacy LIVE / ASYNC — **VERIFIED untouched and still reachable**
`/join`, `/play/*`, `/homeworks/*`, `/my-homeworks` use no accounts. Management
rights come from `canManageHomework` (`src/lib/homework-auth.ts`): the logged-in
admin, or a browser holding the matching `creatorToken`.

⚠️ **`createHomework` (`src/app/homeworks/actions.ts:13`) requires no
authentication at all** — by design ("Public no-registration homework creation",
commit `e7ffae9`), and **not rate-limited**. On a public production deployment this
is an open, unauthenticated database-write endpoint. Finding #6.
