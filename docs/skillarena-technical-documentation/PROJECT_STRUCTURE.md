# Project Structure — Complete Inventory

231 tracked files. `src/generated/prisma` (the generated Prisma client, ~34k LOC) is gitignored and
excluded here. Line counts measured during this investigation.

```
Rahoot-SkillArena/
├── server.ts                 1174  Custom HTTP + Socket.IO server. The most important single file.
├── src/
│   ├── proxy.ts                50  Next 16 middleware. Route-level auth gate.
│   ├── lib/                  1457  Server-side business logic (28 files)
│   ├── components/            577  Shared UI (11 files)
│   └── app/                  8843  App Router: pages, layouts, server actions
├── prisma/
│   ├── schema.prisma          636  22 models/enums, heavily commented
│   ├── migrations/                 12 migrations, incl. raw SQL Prisma cannot express
│   ├── seed.ts                122  Bootstrap Super Admin + 2 programs + 11 subjects
│   └── reset-super-admin.ts    41  One-off recovery tool
├── e2e/                      2677  12 hand-rolled Playwright scripts (no test runner)
├── docs/skillarena-technical-documentation/   <- this folder
├── Dockerfile / firebase.json / deploy/       3 generations of deploy config (1 live)
└── *.md                            Root audit docs from 2026-10-14 (untracked)
```

## `src/lib` — the business-logic layer (28 files)

### Session and auth core

| File | L | Purpose | Depended on by | Depends on |
|---|---|---|---|---|
| `session-core.ts` | 181 | Pure JWT envelope: sign/verify, sub-session shapes, TTLs, capped maps. Deliberately imports **no** `next/headers` and **no** `server-only`, so `server.ts` (plain Node via tsx) can use it. | `session.ts`, `session-envelope.ts`, `proxy.ts`, `server.ts` | `jose` |
| `session-envelope.ts` | 30 | Read/write the `__session` cookie. Callers must read-modify-write so they do not clobber sibling sub-sessions. | `session.ts`, `student-session.ts`, `creator-session.ts`, `hootarena/player-session.ts` | `next/headers`, `session-core` |
| `session.ts` | 124 | The real auth API: `verifyAdminCredentials`, `getAdminSession`, `getCurrentStudent/Admin/SuperAdmin`. Every getter re-checks `sessionVersion` against the database. | ~40 pages/actions | `prisma`, `password`, `session-core` |
| `password.ts` | 26 | scrypt hash/verify with `timingSafeEqual`. No `server-only` because `prisma/seed.ts` imports it. | `session.ts`, student/admin actions, seed | `node:crypto` |
| `student-session.ts` | 30 | Legacy anonymous per-homework identity (`students` map). | legacy play/join | prisma, envelope |
| `creator-session.ts` | 26 | No-login homework-creator identity (`creators` map). | `homework-auth`, `my-homeworks` | envelope |
| `homework-auth.ts` | 25 | `canManageHomework()` — "admin OR this browser's creator token". The single gate for all legacy management. | legacy actions + `homeworks/[id]/layout.tsx` | prisma, session, creator-session |
| `prisma.ts` | 13 | Singleton `PrismaClient`, cached on `globalThis` in dev to survive hot reload. | everything server-side | generated client |

### Domain logic

| File | L | Purpose | Notes |
|---|---|---|---|
| `quiz-constants.ts` | 8 | `QUIZ_QUESTION_POINTS=1`, `QUIZ_QUESTION_TIME_LIMIT_SEC=100`, `QUIZ_MAX_TAB_SWITCHES=2`. Client-safe (no `server-only`). | `QUIZ_QUESTION_POINTS` is **never consumed** — scoring hardcodes `score += 1`. |
| `quiz.ts` | 124 | Attempt lifecycle plus `getCumulativeLeaderboard()`. | `getVisibleQuiz` does **not** filter by status, despite its docstring saying it does. |
| `subjects.ts` | 106 | Eligibility: `eligibleHomeworkWhere()` (listing) and `isStudentEligibleForQuiz()` (single quiz). Returns a match-nothing sentinel rather than `OR: []`, which would match everything. | 2 dead exports: `getSubjectWithGroups`, `getStudentMemberships`. |
| `programs.ts` | 36 | `resolveAdminProgramScope()` — ignores any client-supplied program id for a regular Admin. | 1 dead export: `getProgram`. |
| `scoring.ts` | 67 | Legacy LIVE/ASYNC scoring and per-homework leaderboard. | Missing `import "server-only"` although every sibling has it. |
| `hootarena/scoring.ts` | 77 | HootArena speed scoring and `isSelectionCorrect` (all-or-nothing). Pure functions, hence the only unit-testable module. | Comment references a non-existent `hootarena/questions.ts`. |
| `hootarena/pin.ts` | 30 | 6-digit PIN via `crypto.randomInt`, unique against every game ever created. | |
| `hootarena/access.ts` | 31 | `canAdminManageGame` (Super Admin any, Admin own) plus a loader. No `server-only` because `server.ts` imports it. | |
| `hootarena/player-session.ts` | 26 | Anonymous player identity in the envelope. | |
| `hootarena/socket-events.ts` | 131 | The Socket.IO contract. Encodes privacy in the type system: separate host vs student reveal/leaderboard payload types. | |
| `socket-events.ts` | 82 | Legacy LIVE contract. Sends the full leaderboard to students. | |
| `socket-client.ts` / `hootarena/socket-client.ts` | 14 / 14 | Module-singleton socket per browser tab. | |
| `inco.ts` / `inco-constants.ts` | 45 / 28 | 20-char code generation, SHA-256 hashing, Georgian labels. | |
| `bug-reports.ts` | 35 | Magic-byte image sniffing (PNG/JPEG/GIF/WEBP). Never trusts the extension or `File.type`. | |
| `rate-limit.ts` | 87 | In-memory sliding window plus anonymous per-browser cookie keys. | The key is client-held, so it is clearable. |
| `tokens.ts` | 17 | Join codes (no look-alike characters) and client tokens. | |
| `qr.ts` | 41 | QR data URLs for join and Hoot PIN links. Reads `NEXT_PUBLIC_BASE_URL`. | |
| `admin-constants.ts` | 3 | `MAX_ADMINS = 8`. A separate file because a `"use server"` module may only export async functions. | |

## `src/components` — all 11 verified in use

`AnswerTiles` (3 callers: Hoot play, legacy LiveGame, AsyncOptions) · `CountUp` (result page) ·
`CumulativeLeaderboard` (2) · `HootLeaderboard` + `HootTop3` (2) · `Leaderboard` (4, legacy) ·
`Logo` (12) · `ProgramSelector` (4, Super Admin only) · `QuizTimer` (1) · `TabSwitchMonitor` (1) ·
`ThemeInitScript` (root layout) · `ThemeToggle` (7 — absent from every legacy and HootArena route).

No component is dead. One prop is: `HootLeaderboard`'s `highlightPlayerId` is never passed.

## `src/app` — route groups

### `admin/(dashboard)/` — the staff surface

`(dashboard)` is a **route group**: it wraps every admin page in `layout.tsx` (which re-checks the session)
without contributing a URL segment. 26 pages, each independently calling `getCurrentAdmin()` or
`getCurrentSuperAdmin()` — except `students/[id]/attempts/[attemptId]/page.tsx`, the lone outlier.

Action files and the guard each uses:

- `quizzes/actions.ts` (258 L) — `requireAdmin` + `requireQuizAccess` (program via `quiz.subject.programId`)
- `students/actions.ts` (218 L) — `requireAdmin` + `requireAdminForStudent` (program via `student.programId`)
- `hootarena/actions.ts` (225 L) — `requireAdmin` + `requireHootGameAccess` (ownership) + `requireHootGameEditable` (LOBBY only)
- `admins/actions.ts`, `programs/actions.ts`, `inco/actions.ts` — `requireSuperAdmin`
- `bug-reports/actions.ts` — `getCurrentAdmin` only (deliberately both levels, and deliberately not program-scoped)
- `profile/actions.ts` — self-service only

### `dashboard/` and `quiz/[id]/` — the student surface

Two separate layouts, both re-checking `getCurrentStudent()`. The quiz flow is
`/quiz/[id]` → `/q/[index]` → `/review` → `/result`, with `quiz/[id]/actions.ts` (135 L) holding
`startQuiz`, `selectAnswer`, `reportTabSwitch` and `submitQuizAttempt`.

### `hootarena/` — the public player surface

`/hootarena` (PIN entry) → `/join/[pin]` (nickname) → `/play/[id]` (the socket client). Deliberately **not**
matched by `proxy.ts` — it requires no account.

### Legacy trees (untouched, still functional)

`homeworks/**` (creator/admin management, gated by `[id]/layout.tsx`), `play/**` (LIVE and ASYNC play),
`join/**`, `my-homeworks/`.

### Other

- `attachments/[id]/route.ts` — the app's only route handler. Self-authorizes (owner or any admin) and
  returns an identical 404 for "missing" and "forbidden" so attachment ids cannot be probed.
- `inco/status/` — fully public, no session, by design.

## Dependency direction (strictly enforced)

```
app/**  ──>  lib/**  ──>  generated/prisma
                ^
                │
server.ts ──────┘   (only the modules WITHOUT "server-only")
```

`server.ts` may import only `session-core`, `scoring`, `hootarena/scoring`, `hootarena/access`, `prisma`
and the socket-event types — precisely the modules that omit `import "server-only"`. That omission is
load-bearing, not an oversight: `session-core.ts`, `password.ts`, `quiz-constants.ts`, `inco-constants.ts`
and `hootarena/access.ts` each carry a comment explaining why the guard is absent.

## Unused / legacy / duplicated code (inventory only — nothing was deleted)

**Dead exports:** `getSubjectWithGroups`, `getStudentMemberships` + type `StudentMembership`
(`src/lib/subjects.ts`), `getProgram` (`src/lib/programs.ts`), `QUIZ_QUESTION_POINTS`
(`src/lib/quiz-constants.ts`), `highlightPlayerId` prop (`src/components/HootLeaderboard.tsx`),
`computeHootPoints`'s optional `timeLimitSec` parameter (every caller omits it).

**Dead enum value:** `QuizAttemptEventType.WINDOW_BLUR` is declared in `schema.prisma` and its migration but
never written — `reportTabSwitch` always writes `TAB_HIDDEN`, so blur-triggered and tab-hidden departures
are indistinguishable in the event log.

**Retired deploy config, still present:** `firebase.json` + `.firebaserc` (Firebase Hosting → Cloud Run)
and `deploy/Caddyfile` + `deploy/rahoot.service` (Oracle VM + systemd). Only `Dockerfile` is live. Keep
`firebase.json` in mind: it is the historical reason for the single-`__session`-cookie design.

**Intentional near-duplication (do not "fix" by merging):** `scoring.ts` vs `hootarena/scoring.ts`, and
`socket-events.ts` vs `hootarena/socket-events.ts`. The HootArena copies exist specifically so tuning the
new system can never alter legacy behaviour; `hootarena/scoring.ts` says so in its header comment.

**Naming debt:** `package.json` name is `rahoot`; CSS tokens are `--rahoot-red` (now violet, not red).
Cosmetic only, and `--rahoot-*` names are used as Tailwind utility classes throughout, so renaming is a
wide mechanical change.
