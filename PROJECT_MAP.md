# PROJECT_MAP — SkillArena

> Audit date: 2026-10-14. Evidence base: commit `0f1d23d` on `main`, clean working tree.
> Paths below were read during the audit unless explicitly marked otherwise.

## What this repository is

A student quiz portal for a college with two educational programs. It began as
`Rahoot`, a Kahoot-style clone (the `package.json` name is still `rahoot`), and was
extended into **SkillArena** — an authenticated, program-scoped quiz platform. The
original anonymous system was *not* removed; it still ships alongside the new one.

Browser title is `SkillArena` (`src/app/layout.tsx:17`). The git remote is
`https://github.com/GigiOboladze/SkillArena` (not the original upstream repo).

## Four parallel systems in one codebase

This is the single most important architectural fact. Four separate quiz/game
systems coexist, sharing only the process, the database and the session cookie:

| System | Mode / tables | Auth | Routes | Status |
|---|---|---|---|---|
| **QUIZ** (SkillArena) | `Homework.mode = QUIZ`, `QuizAttempt` | Student account | `/dashboard`, `/quiz/*` | Active development |
| **HootArena** | `HootGame` + `Hoot*` tables | Anonymous nickname + PIN | `/hootarena/*`, `/admin/hootarena/*` | Newest (Oct 2026) |
| **LIVE** (legacy) | `Homework.mode = LIVE`, `Student` | Anonymous, join code | `/join`, `/play/*`, `/homeworks/*` | Legacy, untouched |
| **ASYNC** (legacy) | `Homework.mode = ASYNC`, `Student` | Anonymous, join code | `/join`, `/play/*` | Legacy, untouched |

`HomeworkMode` is defined at `prisma/schema.prisma:14`. HootArena deliberately does
*not* reuse `Homework` — it has its own table family.

## Technology stack (verified in `package.json`)

- **Next.js 16.3.4**, App Router. React **19.2.8**.
- **Custom Node server** — `server.ts` (1174 lines) wraps Next and hosts Socket.IO.
  Started via `tsx`, not `next start`. Required because LIVE mode and HootArena
  need WebSockets.
- **Prisma 6.19.3** → PostgreSQL. Client generated to `src/generated/prisma`
  (gitignored; ~34k LOC of generated code — ignore it when reading the codebase).
- **Tailwind CSS v4**, CSS-first. There is **no `tailwind.config.js`**; all design
  tokens live in `src/app/globals.css` (`@theme inline`, line 92).
- **`jose`** for hand-rolled JWT sessions. There is **no NextAuth**.
- **Playwright** for 12 end-to-end suites in `e2e/`. There is **no unit-test runner**
  (no Jest, no Vitest).
- `nanoid` (codes/passwords), `qrcode` (join QR codes), `socket.io` 4.8.3.

## Source size

- Real source: **151 files, ~10,900 LOC** (`src/**` excluding `src/generated`, plus `server.ts`).
- Generated Prisma client: ~34,000 LOC in `src/generated/prisma` — not hand-maintained.

## Directory layout

```
server.ts                    Custom HTTP + Socket.IO server; both live-game engines
src/proxy.ts                 Next 16 middleware (renamed from middleware.ts)
src/app/                     App Router (see route inventory below)
src/components/              11 shared client components
src/lib/                     Domain logic, server-only unless noted
src/generated/prisma/        Generated client
prisma/schema.prisma         636 lines, heavily commented — the best spec in the repo
prisma/migrations/           12 migrations, several with hand-written SQL constraints
prisma/seed.ts               Idempotent seed: Super Admin + 2 programs + subjects/groups
prisma/reset-super-admin.ts  Recovery script (not part of normal operation)
e2e/                         12 Playwright suites, run individually via npm scripts
deploy/                      Caddyfile + systemd unit (stale — see TESTING_AND_DEPLOYMENT.md)
firebase.json, .firebaserc   Stale Firebase/Cloud Run config
Dockerfile                   Container build (comments still say Cloud Run)
neon.ts                      Neon platform config
```

## `src/lib` module map

| File | Purpose |
|---|---|
| `session-core.ts` | Pure JWT envelope helpers. **No `server-only`** so `server.ts` can import it. Defines the single `__session` cookie. |
| `session.ts` | `server-only`. Credential verification + the DB-backed `sessionVersion` check. The real auth authority. |
| `session-envelope.ts` | Cookie read/write via `next/headers`. |
| `password.ts` | scrypt hash/verify with `timingSafeEqual`. No `server-only` (the seed imports it). |
| `prisma.ts` | Singleton `PrismaClient` with a dev hot-reload guard. |
| `subjects.ts` | **Quiz eligibility logic** — `eligibleHomeworkWhere`, `isStudentEligibleForQuiz`. |
| `programs.ts` | `resolveAdminProgramScope` — the program-scoping authority for admin views. |
| `quiz.ts` | Attempt lifecycle, per-question deadlines, cumulative leaderboard. |
| `quiz-constants.ts` | The fixed quiz rules. Client-safe (no `server-only`). |
| `admin-constants.ts` | `MAX_ADMINS = 8`. |
| `bug-reports.ts` | Magic-byte image sniffing; attachment limits. |
| `inco.ts` / `inco-constants.ts` | Anonymous feedback; SHA-256 code hashing. Georgian UI labels. |
| `rate-limit.ts` | In-memory sliding window + anonymous per-browser keys. |
| `scoring.ts` | Legacy LIVE-mode speed scoring. |
| `socket-events.ts`, `socket-client.ts` | Legacy LIVE Socket.IO contract. |
| `tokens.ts` | Join codes / client tokens. |
| `qr.ts` | QR generation. |
| `homework-auth.ts`, `creator-session.ts`, `student-session.ts` | Legacy anonymous auth. |
| `hootarena/` | `access.ts`, `pin.ts`, `player-session.ts`, `scoring.ts`, `socket-events.ts`, `socket-client.ts` |

## Components (`src/components`)

`AnswerTiles`, `CountUp`, `CumulativeLeaderboard`, `HootLeaderboard`, `Leaderboard`,
`Logo`, `ProgramSelector`, `QuizTimer`, `TabSwitchMonitor`, `ThemeInitScript`,
`ThemeToggle`.

## Route inventory (from `npm run build` — all verified to compile)

**Public / legacy (no account):**
`/`, `/join`, `/join/[code]`, `/play/[homeworkId]`, `/play/[homeworkId]/q/[index]`,
`/play/[homeworkId]/done`, `/play/[homeworkId]/leaderboard`, `/homeworks/new`,
`/homeworks/[id]`, `/homeworks/[id]/host`, `/homeworks/[id]/grade`,
`/homeworks/[id]/leaderboard`, `/homeworks/[id]/questions/new`,
`/homeworks/[id]/questions/[qid]/edit`, `/my-homeworks`, `/inco/status`

**HootArena (anonymous PIN join):**
`/hootarena`, `/hootarena/join/[pin]`, `/hootarena/play/[id]`

**Student (account required):**
`/login`, `/dashboard`, `/dashboard/leaderboard`, `/dashboard/profile`,
`/dashboard/inco`, `/dashboard/bug-reports`, `/dashboard/bug-reports/new`,
`/quiz/[id]`, `/quiz/[id]/q/[index]`, `/quiz/[id]/review`, `/quiz/[id]/result`

**Admin (account required):**
`/admin/login`, `/admin`, `/admin/quizzes` (+ `new`, `[id]`, `[id]/results`,
`[id]/questions/new`, `[id]/questions/[qid]/edit`), `/admin/students`
(+ `[id]`, `[id]/edit`, `[id]/attempts/[attemptId]`), `/admin/leaderboard`,
`/admin/bug-reports` (+ `[id]`), `/admin/profile`, `/admin/hootarena`
(+ `new`, `[id]`, `[id]/host`, `[id]/questions/*`)

**Super-Admin-only (404 for regular admins):**
`/admin/admins`, `/admin/programs`, `/admin/programs/[id]`, `/admin/inco`, `/admin/inco/[id]`

**Route handler:** `/attachments/[id]` — serves bug-report screenshot bytes.

## How the pieces connect

```
Browser
  └─ src/proxy.ts  (coarse gate: /admin/*, /dashboard/*, /quiz/*)
       └─ layout.tsx re-checks the session server-side (defense in depth)
            └─ page.tsx / actions.ts
                 ├─ src/lib/session.ts   → is this really who they claim? (DB sessionVersion)
                 ├─ src/lib/subjects.ts  → may this student see this quiz?
                 ├─ src/lib/programs.ts  → which program is this admin scoped to?
                 └─ src/lib/prisma.ts    → PostgreSQL
Socket.IO (same process, server.ts)
  ├─ default namespace  → legacy LIVE mode
  └─ "/hootarena"       → HootArena
```

**Critical constraint:** both live engines keep game state in **process memory**
(`liveStates` and `hootStates` Maps in `server.ts`). The app **must run as a single
instance**. Horizontal scaling silently breaks live games — see the `Dockerfile`
comment and TESTING_AND_DEPLOYMENT.md.

## Reading order for a newcomer

1. `prisma/schema.prisma` — the richest, most accurate spec in the repo.
2. `src/lib/session-core.ts` + `src/lib/session.ts` — the auth model.
3. `src/lib/subjects.ts` — program/group eligibility, the core business rule.
4. `src/app/quiz/[id]/actions.ts` — the quiz engine's server-side authority.
5. `server.ts` — only if touching live games.
