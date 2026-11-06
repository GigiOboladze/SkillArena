# DATA_MODEL — SkillArena

> Source: `prisma/schema.prisma` (636 lines) + `prisma/migrations/` (12 migrations).
> The schema file is extensively commented and is the authoritative spec; this
> document summarises it and records the **hand-written SQL constraints** that
> live only in migrations and are therefore invisible in the schema file.

## Database

PostgreSQL via Prisma 6.19.3. Generated client output: `src/generated/prisma`
(non-default location, gitignored). Datasource uses both `DATABASE_URL` and
`SHADOW_DATABASE_URL` (`schema.prisma:8-12`).

## Enums

| Enum | Values |
|---|---|
| `HomeworkMode` | `LIVE`, `ASYNC`, `QUIZ` |
| `UserRole` | `SUPER_ADMIN`, `ADMIN`, `STUDENT` |
| `HomeworkStatus` | `DRAFT`, `OPEN`, `CLOSED` |
| `LivePhase` | `LOBBY`, `QUESTION`, `REVEAL`, `FINISHED` |
| `QuestionType` | `MULTIPLE_CHOICE`, `PARAGRAPH` |
| `QuizAttemptStatus` | `IN_PROGRESS`, `COMPLETED`, `FAILED` |
| `QuizAttemptEventType` | `TAB_HIDDEN`, `WINDOW_BLUR`, `FAILED` |
| `BugReportStatus` | `OPEN`, `IN_PROGRESS`, `RESOLVED` |
| `IncoCategory` | `PERSONAL`, `ACADEMIC`, `COMPLAINT`, `SUGGESTION`, `PROGRAM`, `LECTURER`, `ADMINISTRATION`, `STUDENT`, `OTHER` |
| `IncoStatus` | `NEW`, `IN_PROGRESS`, `RESOLVED` |
| `HootGameStatus` | `LOBBY`, `QUESTION`, `REVEAL`, `LEADERBOARD`, `FINISHED` |
| `HootQuestionType` | `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `TRUE_FALSE` |

**Verified dead enum value:** `QuizAttemptEventType.WINDOW_BLUR` is declared
(migration `20260913220000`) but **never written anywhere in the codebase**.
`reportTabSwitch` (`src/app/quiz/[id]/actions.ts:82`) always writes `TAB_HIDDEN`,
even for blur-triggered departures. Window-blur events are therefore
indistinguishable from tab-hidden events in the audit trail.

## Model groups

### 1. SkillArena accounts and org structure

**`User`** (`users`) — the real, persistent account for admins *and* students.
- `username` unique (normalised to lowercase at login, `session.ts:24`).
- `passwordHash` — scrypt, format `<salt>:<derivedKeyHex>`.
- `role: UserRole`.
- `sessionVersion Int @default(0)` — incremented on every password change; the
  mechanism that makes stateless JWTs revocable (see BUSINESS_LOGIC.md).
- `programId String?` — nullable in Prisma, but **constrained in SQL** (below).

**`Program`** (`programs`) — `name` unique, `order`, and `groupCount Int @default(3)`.
`groupCount` is per-program data, not a global constant. Deliberately **no delete
workflow**.

**`Subject`** (`subjects`) — belongs to exactly one `Program`.
`@@unique([programId, name])` — two programs may each have their own "English".
Deliberately **no delete workflow** (documented at `schema.prisma:170-178`).

**`Group`** (`groups`) — owned by a `Subject`, `@@unique([subjectId, name])`.
"Group I" in JavaScript and "Group I" in Git are *different rows*.

**`StudentSubjectGroup`** (`student_subject_groups`) — join row.
`@@unique([studentId, subjectId])` — **DB-enforced** "one group per subject per
student". `groupId` is **nullable**: the row means "assigned to this subject",
with "no group decided yet" as a distinct, access-denying state.

### 2. Quizzes and attempts

**`Homework`** (`homeworks`) — shared by all three `HomeworkMode` values.
- `joinCode` unique; `creatorToken` nullable (legacy no-login creator ownership).
- `livePhase`, `currentQuestionIndex` — LIVE only.
- `ownerUserId` — set for QUIZ mode only.
- `subjectId` — nullable; required before a QUIZ may be published.

**`Question`** (`questions`) — `order`, `type`, `text`,
`points Int @default(1000)`, `timeLimitSec Int @default(20)`.
⚠️ **These two column defaults are legacy LIVE-mode values and are ignored by
QUIZ mode**, which uses the fixed constants in `src/lib/quiz-constants.ts`
(1 point, 100 s). Do not read the schema defaults as the quiz rules.

**`Option`** (`options`) — `text`, `isCorrect`, `order`.

**`QuizTargetGroup`** (`quiz_target_groups`) — which groups may see a QUIZ.
`@@unique([homeworkId, groupId])`.

**`QuizAttempt`** (`quiz_attempts`) — the SkillArena attempt.
- **`@@unique([studentId, homeworkId])`** — the single DB-level guarantee of
  "one attempt ever per student per quiz", whether completed or failed.
- `status`, `score`, `totalQuestions`, `tabSwitchCount`, `failureReason`.

**`AttemptAnswer`** (`attempt_answers`) — one row per question *opened*.
- `@@unique([attemptId, questionId])`.
- **`deadlineAt`** — fixed at row creation (`now + 100s`) and never moved. This is
  what makes refresh/revisit unable to buy more time (`src/lib/quiz.ts:48-58`
  uses `upsert` with an empty `update: {}` branch to make that atomic).
- `isCorrect` stays `null` until final submission — correctness is never revealed
  mid-quiz.

**`QuizAttemptEvent`** (`quiz_attempt_events`) — anti-cheat audit trail.

### 3. Legacy anonymous play

**`Student`** (`students`) — a *nameless, passwordless, per-homework* join row.
Not an account. `clientToken` unique, stored in the browser. **Entirely separate
from `User`** despite the confusing name.

**`Answer`** (`answers`) — legacy answers, `@@unique([studentId, questionId])`,
with `pointsAwarded` and nullable `isCorrect` (paragraph answers start ungraded).

### 4. Bug reports

**`BugReport`** (`bug_reports`) — `studentId` → `User` (Cascade), `description`, `status`.

**`BugReportAttachment`** (`bug_report_attachments`) — `data Bytes`. Screenshots are
stored **as database bytes**, not on disk, because the container filesystem is
ephemeral. Max 2 attachments, 3 MB each (`src/lib/bug-reports.ts:3-5`).

### 5. INCO (anonymous feedback)

**`IncoSubmission`** (`inco_submissions`) — `category`, `message`, `status`,
`response`, `codeHash` (unique).

**The anonymity guarantee is structural:** this model has **no relation to `User`
or `Student` at all — not even a nullable one**. There is no column to join
through, so no query can reveal an author, even with full DB access. Only the
SHA-256 hash of the student's reference code is stored, never the code. No IP or
user-agent is captured anywhere in the feature (`schema.prisma:466-479`,
`src/lib/inco.ts`, `src/lib/rate-limit.ts:42-51`).

### 6. HootArena

**`HootGame`** (`hoot_games`) — `pin` unique, `hostId` → `User` (**Restrict**),
`status`, `currentQuestionIndex Int @default(-1)`.
**No program/subject targeting** — access is "whoever has the PIN".

**`HootQuestion`** (`hoot_questions`) — `@@unique([gameId, order])`.

**`HootOption`** (`hoot_options`).

**`HootPlayer`** (`hoot_players`) — a self-chosen nickname, **no account**.
`@@unique([gameId, username])` doubles as the idempotent-reconnect key; `clientToken`
is the only credential. `connected` is soft presence state.

**`HootResponse`** (`hoot_responses`) — `@@unique([playerId, questionId])`,
`selectedOptionIds String[]` (1 for single/true-false, 1+ for multiple choice).

## Hand-written SQL constraints (migrations only — not visible in schema.prisma)

These are real invariants that Prisma's schema language cannot express:

1. **Exactly one Super Admin, ever**
   `migrations/20260916120100_promote_super_admin/migration.sql:15`
   ```sql
   CREATE UNIQUE INDEX "users_single_super_admin" ON "users" ("role")
     WHERE "role" = 'SUPER_ADMIN';
   ```

2. **Program assignment mandatory for every role except Super Admin**
   `migrations/20260919090000_programs/migration.sql:56`
   ```sql
   ALTER TABLE "users" ADD CONSTRAINT "users_program_required_check" CHECK (
     ("role" = 'SUPER_ADMIN' AND "programId" IS NULL) OR
     ("role" != 'SUPER_ADMIN' AND "programId" IS NOT NULL)
   );
   ```
   **Consequence:** it is impossible to have a `STUDENT` row with `programId = NULL`.
   The "no program assigned" UI state (`src/app/dashboard/page.tsx:11`) is therefore
   defensive code that the database makes unreachable for students in practice.
   A student is denied quizzes by having *no group*, not by having no program.

## Group counts — current truth

Migration history here is easy to misread, so it is spelled out:

- `20260919090000_programs` **deleted** every `Group IV` and set all programs to 3 groups.
- `20260921083000_program_group_count` **reversed that for Front-end Development**,
  adding `groupCount` and restoring `Group IV`:
  > "Front-end Development was incorrectly reduced to 3 fixed groups […] it has
  > always actually needed 4 (I-IV). Networks correctly stays at 3, the default."

**Current state (confirmed in `prisma/seed.ts:15-41`):**

| Program | `groupCount` | Groups |
|---|---|---|
| Front-end Development | **4** | Group I, II, III, **IV** |
| Networks | **3** | Group I, II, III |

Group IV **exists** for Front-end Development. Any instruction saying "group IV was
removed" describes a state that was reverted on 2026-09-21.

Networks' seeded subjects are in Georgian (`migrations/20260919090000_programs/migration.sql:68-71`).

## Referential-integrity map

**`onDelete: Restrict`** (3 places — deletion is *blocked*):
- `User.program` (`schema.prisma:91`)
- `Subject.program` (`:184`)
- `HootGame.host` (`:531`) ← **see CURRENT_STATE.md; this one causes a real bug**

**`onDelete: SetNull`:** `Homework.ownerUser`, `Homework.subject`,
`StudentSubjectGroup.group`.

**`onDelete: Cascade`:** everything else — notably `Homework` → `Question`,
`QuizAttempt`, `QuizTargetGroup`, `Student`. **Deleting a quiz permanently destroys
every student's attempt and score for it** (the UI does warn explicitly:
`src/app/admin/(dashboard)/quizzes/DeleteQuizButton.tsx`).

## Data ownership

| Data | Owner | Who may read it |
|---|---|---|
| `QuizAttempt` + `AttemptAnswer` | the student | the student (own only), their program's admins, Super Admin |
| `Homework` (QUIZ) | `ownerUserId`; scoped by `subject.programId` | admins of that program, Super Admin |
| `HootGame` | `hostId` | its host, Super Admin (ownership-based, not program-based) |
| `BugReport` | the reporting student | that student + **any** admin (deliberately not program-scoped) |
| `IncoSubmission` | **nobody** — unattributable by design | Super Admin only; author knowable to no one |
| `StudentSubjectGroup` | the student | their program's admins, Super Admin |

## Key queries worth knowing

- **Quiz eligibility (list):** `eligibleHomeworkWhere` (`src/lib/subjects.ts:51`) —
  builds a Prisma `OR` of `(subjectId, targetGroups.some.groupId)` pairs. Returns a
  deliberately-unmatchable fragment (`{ id: "__no_program__" }`) rather than `OR: []`,
  which would match *everything*.
- **Quiz eligibility (single):** `isStudentEligibleForQuiz` (`:75`) — re-checks
  program match, then membership, then target group.
- **Cumulative leaderboard:** `getCumulativeLeaderboard(programId)` (`src/lib/quiz.ts:94`) —
  computed live on every call, never cached. Attempts are permanently attributed to
  the program of the quiz taken, via `homework.subject.programId`, so a student who
  changes program keeps their history on their profile but drops out of both
  leaderboards. Ties break alphabetically by last then first name.
- **Session validity:** every `getAdminSession` / `getStudentUserSession` call does a
  `prisma.user.findUnique` to compare `sessionVersion`. This is an intentional
  per-request DB read (`src/lib/session.ts:62-81`).
