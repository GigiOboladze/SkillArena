# Authentication and Permissions

## The session model

There is **one cookie**, `__session`, containing **one signed JWT**, whose payload holds **one envelope**
with up to five independent sub-sessions. No NextAuth; everything is hand-rolled in
`src/lib/session-core.ts`.

```ts
// src/lib/session-core.ts:50-63
type SessionEnvelope = {
  admin?:       { userId, username, exp, sv }            // 12 h  — ADMIN or SUPER_ADMIN
  studentUser?: { userId, username, exp, sv }            // 14 d  — STUDENT
  students?:    Record<homeworkId, {studentId, clientToken}>   // legacy anonymous play
  creators?:    Record<homeworkId, creatorToken>              // legacy no-login creator
  hootPlayers?: Record<gameId, {playerId, clientToken}>       // HootArena anonymous player
}
```

Cookie flags (`session-envelope.ts:23-29`): `httpOnly: true`, `sameSite: "lax"`,
`secure: NODE_ENV === "production"`, `path: "/"`, `maxAge` 30 days. Outer JWT TTL is 30 d (`HS256`), which
caps every sub-session; `admin` additionally expires after 12 h and `studentUser` after 14 d, checked
independently in `adminFromEnvelope` / `studentUserFromEnvelope`.

Three design points worth knowing:

- **Why one cookie.** Firebase Hosting strips every cookie except one literally named `__session` when
  proxying to Cloud Run. Documented at `session-core.ts:9-16`. Still load-bearing even though the app now
  runs on Railway.
- **Read-modify-write is mandatory.** `writeSessionEnvelope` re-signs the *whole* envelope, so any code
  adding a sub-session must read the existing one first or it will silently log out the other roles.
  Every caller does this correctly.
- **Maps are capped at 15 entries** (`MAX_STUDENT_ENTRIES`, `MAX_CREATOR_ENTRIES`,
  `MAX_HOOT_PLAYER_ENTRIES`), evicting oldest-first via `withCappedEntry`, to stay under the ~4 KB browser
  cookie limit.

## Password storage

`src/lib/password.ts`: **scrypt** from `node:crypto` (no bcrypt dependency), 16-byte random salt,
64-byte derived key, stored as `"<saltHex>:<keyHex>"`, compared with `timingSafeEqual`. Length mismatch
short-circuits before the comparison. Minimum length is 8, enforced in each action that sets a password.

Auto-generated passwords use a 10-character no-look-alike alphabet
(`students/actions.ts:36`); INCO reference codes use 20 characters from a 55-character alphabet (~117 bits).

## Session invalidation — how logout-everywhere works

`User.sessionVersion` is an integer incremented on **every** password change. The value current at issue
time is embedded in the JWT as `sv`. `getAdminSession` / `getStudentUserSession` load the row and compare:

```ts
// src/lib/session.ts:78-80
const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { sessionVersion: true } });
if (!user || user.sessionVersion !== session.sv) return null;
```

A JWT cannot be edited after issue, so every other device's cookie carries the pre-change number forever
and stops verifying the instant the counter moves. This buys revocation without a server-side session
store, at the cost of one indexed `SELECT` per authenticated request — which the doc comment defends on the
grounds that every caller was about to hit the database anyway.

Username changes deliberately do **not** bump `sessionVersion` (they re-issue the local session only), so
renaming yourself does not log out your other devices.

## The four enforcement layers

| Layer | File | Checks | Hits DB? |
|---|---|---|---|
| 1. Middleware | `src/proxy.ts` | JWT signature + sub-session presence/expiry for `/admin/*`, `/dashboard/*`, `/quiz/*` | No |
| 2. Layout | `admin/(dashboard)/layout.tsx`, `dashboard/layout.tsx`, `quiz/[id]/layout.tsx` | `getCurrentAdmin` / `getCurrentStudent` → role + `sessionVersion` | Yes |
| 3. Page | each `page.tsx` | role (`getCurrentSuperAdmin`) + per-resource program ownership | Yes |
| 4. Server Action | each `actions.ts` | everything again, independently | Yes |

**Layer 4 is the only one that actually secures mutations.** A Server Action is an independently
invocable HTTP endpoint; reaching it does not require rendering the page that normally calls it. The
codebase understands this — `admins/actions.ts:10-13` and `inco/actions.ts:9-14` both carry comments saying
so — which is why the IDOR findings matter: those actions check the *parent* and then trust an unvalidated
*child* id.

### What the middleware deliberately does not do
`proxy.ts` never touches the database (so no `sessionVersion` check) and never distinguishes ADMIN from
SUPER_ADMIN. Both are intentional: the matcher is only a cheap first gate, and role granularity is a
per-page concern.

### Routes NOT behind the middleware
`/`, `/login`, `/admin/login`, `/join/**`, `/play/**`, `/homeworks/**`, `/my-homeworks`, `/hootarena/**`,
`/inco/status`, `/attachments/[id]`. Each of these either needs no auth by design or authorizes itself —
`/attachments/[id]/route.ts` and `homeworks/[id]/layout.tsx` both do their own checks.

## Role matrix

### STUDENT
Account created by an admin; **there is no public sign-up anywhere**.

| Can | Cannot |
|---|---|
| `/dashboard`, `/dashboard/leaderboard`, `/dashboard/profile`, `/dashboard/bug-reports*`, `/dashboard/inco` | Any `/admin/*` route (no admin sub-session can be minted by a student login — `verifyStudentCredentials` restricts to `role: STUDENT`) |
| See quizzes where their group for that subject is in `QuizTargetGroup` **and** the subject's program equals their own | See any other program's quizzes, even with a matching group *number* |
| Take each quiz exactly once (`@@unique([studentId, homeworkId])`) | Retake, or see another student's attempt |
| Change own username and password | Change their own program or group assignments (`updateStudent` never reads `programId` from the form) |
| File bug reports with ≤2 images; see only their own | See another student's reports (`/dashboard/bug-reports` filters by `studentId`; `/attachments/[id]` checks ownership) |
| Submit INCO anonymously; check status by code | Read other INCO submissions, or discover who sent one (no column exists) |
| See the cumulative leaderboard for their program — **including classmates' names and scores** | — |

### ADMIN (regular)
Created only by the Super Admin; always bound to exactly one program.

Scoped to **their own program**, enforced per resource, not by list filtering:
- Quizzes — `requireQuizAccess` compares `quiz.subject.programId` to `admin.programId`
- Students — `requireAdminForStudent` compares `student.programId`
- Subject/group pickers — `listSubjectsWithGroups(programId)` where `programId` comes from
  `resolveAdminProgramScope`, which **ignores any `?program=` query param for a non-Super-Admin**

Can: full quiz CRUD + publish within their program · create/edit/delete students, reset or set passwords ·
create and host HootArena games **they created** · view leaderboard and quiz results for their program ·
triage bug reports · change own username/password · create legacy LIVE/ASYNC homework.

Cannot: `/admin/admins`, `/admin/programs`, `/admin/inco` (all `notFound()` server-side, not merely hidden
from the nav) · move a student between programs · host another admin's HootArena game.

**Two real exceptions to program scoping:**
1. **Bug reports are global** — list, detail and `updateBugReportStatus` apply no program filter, and the
   nav badge counts every program's OPEN reports. Any admin sees any student's reports and name.
2. **`/admin/students/[id]/attempts/[attemptId]`** has no program check at all (see below).

### SUPER_ADMIN
Exactly one, ever. Enforced three ways: the partial unique index `users_single_super_admin`; `programId`
forced NULL by the CHECK constraint; and the role being **unassignable through any UI** —
`createAdminAccount` hardcodes `role: "ADMIN"`.

Everything an Admin can do, across **all programs** (via `ProgramSelector` → `?program=<id>`, validated
against real rows), plus: create admins (max 8 total, counted server-side immediately before the write) ·
delete admins · move an admin or student between programs · create programs (with their own `groupCount`,
1–10) and subjects (auto-creating fixed groups) · read and answer INCO.

Protections against self-destruction: `deleteAdminAccount` and `changeAdminProgram` both filter
`role: "ADMIN"`, so the Super Admin's own row is structurally unreachable by them — not merely hidden.

## Legacy / anonymous identities

| Identity | Credential | Granted by | Verified by |
|---|---|---|---|
| Legacy student | `(studentId, clientToken)` | `joinHomework` after a valid join code on an OPEN homework | `getStudentForHomework` — `findFirst({id, homeworkId, clientToken})`; socket `lobby:join` repeats it |
| Legacy creator | `creatorToken` per homework | `createHomework` — **no authentication at all, by design** | `canManageHomework` compares the cookie's token to `Homework.creatorToken` |
| HootArena player | `(playerId, clientToken)` | `joinHootGame` after a valid PIN | `getHootPlayerForGame`; socket `player:join` repeats it |

These are bearer tokens scoped to one row, not accounts. Losing the cookie loses the identity — stated
plainly in `my-homeworks/page.tsx:12-16` as the deliberate cost of "no registration, no nothing".

**The creator identity is the weak point.** Anyone can mint one by creating a throwaway homework, and
`canManageHomework` then returns true for *that* homework — which is correct. The bug is that three legacy
actions go on to act on an unvalidated child id. See `SECURITY_AUDIT.md`.

## Socket authorization

| Event | Authorized by |
|---|---|
| `lobby:join` (legacy) | `(studentId, clientToken)` must match a `Student` row for that homework, and `homework.mode === "LIVE"` |
| `host:join` (legacy) | handshake cookie → admin sub-session, **or** `envelope.creators[homeworkId]` matching `Homework.creatorToken` |
| `host:start/next/end/restart` (legacy) | **only `socket.data.isHost`** — the payload's `homeworkId` is never compared to the one authorized at join. **This is a confirmed bug.** |
| `student:answer` (legacy) | `socket.data.studentId` present **and** `socket.data.homeworkId === homeworkId` |
| `player:join` (Hoot) | `(playerId, gameId, clientToken)` must match a `HootPlayer` row; game must not be FINISHED |
| `host:join` (Hoot) | `verifyHootAdmin` — cookie → admin + role + **live `sessionVersion` check** — then `canAdminManageGame` |
| `host:start/next/end` (Hoot) | `socket.data.isHost` **and** `socket.data.gameId === gameId` ✅ |
| `player:answer` (Hoot) | `socket.data.playerId` present, `socket.data.gameId === gameId`, question matches current, not already answered, within the server-side deadline |

The HootArena handlers carry an explicit comment (`server.ts:1049-1053`) explaining why `isHost` alone is
insufficient. The legacy handlers lack exactly that check — the newer code fixed a class of bug the older
code still has.

## Confirmed authorization defects

Ranked; full exploit paths in `SECURITY_AUDIT.md`.

1. **Unauthenticated cross-homework question delete / answer grading.** `updateQuestion`, `deleteQuestion`
   (`homeworks/[id]/actions.ts:123,160`) and `gradeAnswer` (`homeworks/[id]/grade/actions.ts:8`) validate
   the homework but then act on an arbitrary `questionId` / `answerId`. Reachable by anyone, because
   homework creation needs no account.
2. **Admin-level IDOR, same shape:** `updateQuizQuestion`/`deleteQuizQuestion`,
   `updateHootQuestion`/`deleteHootQuestion`.
3. **Legacy host events trust the payload's `homeworkId`** — including `host:restart`, which deletes every
   answer for that homework.
4. **Cross-program leak** at `/admin/students/[id]/attempts/[attemptId]` — the only admin page with no
   session or program check (26 pages audited).
5. **No rate limiting on either login action**, though `checkRateLimit` exists and is used elsewhere.
   Because verification is intentionally CPU-expensive scrypt on a mandatorily single-instance deployment,
   a login flood is also a DoS vector.
6. **Plaintext passwords in redirect URLs** (`?password=…`) — browser history, access logs, `Referer`.
7. **Password change requires no current password** — documented as a product requirement, mitigated by
   forcing a fresh login, but it lets anyone with a momentarily unlocked session seize the account.
