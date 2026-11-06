# Features and Business Logic

Every rule below is traced to the code that enforces it.

## A. Authentication and user management

- **No public registration exists.** Students are created by an admin at `/admin/students`; admins only by
  the Super Admin; the Super Admin only by `prisma/seed.ts` from `ADMIN_USERNAME`/`ADMIN_PASSWORD`.
- **Usernames are normalised to lowercase** consistently — on login (`session.ts:24`), creation
  (`students/actions.ts:75`), update (`:113`), admin creation, and both profile pages. No case-mismatch
  defect exists.
- **Two login forms, one session shape.** `/admin/login` accepts `SUPER_ADMIN|ADMIN`; `/login` accepts
  `STUDENT` only. Both redirect back to a validated `from` param — `from.startsWith("/admin")` or
  `/dashboard`/`/quiz` respectively, so an open redirect is not possible.
- **Temp passwords** are auto-generated (10 chars, no look-alikes) when the admin leaves the field blank,
  and shown **once** on the next screen.
- **Password change invalidates every session everywhere** by bumping `sessionVersion`; the changing
  session is additionally destroyed, forcing a fresh login. No current-password confirmation is required —
  explicitly commented as a product requirement.
- **Session expiry:** admin 12 h, student 14 d, outer envelope 30 d.

## B. Programs, subjects and groups

Real database rows, not enums, so the Super Admin can extend the curriculum with no deploy.

```
Program ("Front-end Development", groupCount 4)
└── Subject ("JavaScript")
    ├── Group I, II, III, IV          ← created automatically, count from Program.groupCount
    └── Homework(mode=QUIZ) ── QuizTargetGroup ──> which groups can see it
Student ── StudentSubjectGroup(subject, group?) ── one row per (student, subject)
```

- Group names are `Group ` + a Roman numeral from a 10-entry lookup table
  (`programs/actions.ts:22`), created in the same transaction as the subject. `groupCount` is clamped to
  1–10.
- **A subject's groups are fixed at creation.** There is no add/remove-group workflow, and raising
  `Program.groupCount` later does not retrofit existing subjects — stated in the schema comment.
- Front-end Development = 4 groups, Networks = 3. This is per-program data, fixed by migration
  `20260921083000` after an earlier migration wrongly assumed a global 3.
- **Assignment has three states**, not two (`SubjectGroupFields.tsx`): *not assigned* (sentinel
  `__unassigned__`, no row), *assigned with no group yet* (row with `groupId: null` → the student sees the
  subject plus a "waiting on a group" message and no quizzes), *assigned to a group*. The parser uses
  `?? UNASSIGNED` rather than `|| UNASSIGNED` precisely because `""` is a meaningful value.
- **Program change** (Super Admin only) clears all subject/group assignments in the same transaction and
  never touches `QuizAttempt` rows.
- Programs and subjects are **never deleted** — by design, documented in the schema.

### Eligibility — the single most important business rule
A student may see/start a QUIZ-mode homework iff **all** of:
1. `homework.mode === "QUIZ"` and `status === "OPEN"`
2. they have a `StudentSubjectGroup` for `homework.subjectId` with a **non-null** `groupId`
3. that `groupId` appears in the quiz's `QuizTargetGroup` rows
4. `homework.subject.programId === student.programId`

Implemented twice, deliberately: `eligibleHomeworkWhere()` builds a Prisma fragment for listing, and
`isStudentEligibleForQuiz()` re-checks one quiz at start time, so knowing a URL is not enough. Condition 4
exists to neutralise a stale assignment left over from a previous program. A student with zero eligible
memberships gets a sentinel `{id: "__no_memberships__"}` rather than `OR: []`, which in Prisma would match
*everything*.

## C. Standard quizzes (SkillArena QUIZ mode)

### Fixed, non-configurable rules (`src/lib/quiz-constants.ts`)
- **1 point per question**, no speed bonus
- **100 seconds per question**
- **Max 2 tab switches; the 3rd fails the attempt** with score 0
- Always 4 options, exactly one correct (`parseQuizQuestionForm` requires all four filled and
  `1 ≤ correct ≤ 4`); `points: 1` and `timeLimitSec: 100` are hardcoded at creation

> ⚠ `QUIZ_QUESTION_POINTS` is exported but **never used** — `submitQuizAttempt` hardcodes `score += 1`.
> Changing the constant would not change scoring.

### Publication flow
`DRAFT → OPEN → CLOSED`, free movement between them, but `OPEN` requires **a subject, ≥1 target group and
≥1 question** (`setQuizStatus:120-133`). The zero-question guard exists because a published empty quiz
traps a student permanently: `startQuiz` creates their one-and-only attempt, then the question page
(index 0 ≥ total 0) bounces back to the start screen forever. Symmetrically,
`deleteQuizQuestion` refuses to take a published quiz to zero questions.
`createQuizQuestion` has **no** such guard, which is the root of the `totalQuestions` drift bug.

### Attempt lifecycle
```
/quiz/[id]        start screen; eligibility checked if no attempt yet
   │ startQuiz    → re-check status OPEN + eligibility → create QuizAttempt (snapshot totalQuestions)
   ▼
/quiz/[id]/q/0 … /q/N-1
   │ first view of each question upserts AttemptAnswer with deadlineAt = now + 100 s (never moves)
   │ selectAnswer writes selectedOptionId only while Date.now() < deadlineAt
   │ free Previous/Next navigation; answers changeable until that question's deadline
   ▼
/quiz/[id]/review   per-question "Your answer / Time expired / Not answered"
   │ submitQuizAttempt  → grade all, sum score, mark COMPLETED  (one $transaction)
   ▼
/quiz/[id]/result   score, cumulative total, per-question correct answers
```

- **One attempt ever**, guaranteed by `@@unique([studentId, homeworkId])` — not just app logic.
- **Grading happens only at submission.** `AttemptAnswer.isCorrect` stays NULL until then, so correctness
  is never leaked mid-quiz.
- **Refresh/revisit cannot reset a timer** — the upsert's `update: {}` branch is what guarantees it.
- **A question whose timer expired is locked**: the tiles render `disabled`, and `selectAnswer` silently
  ignores the write server-side even if the client is bypassed.

> ⚠ **Timers start when a question is first *viewed*, not when answering begins.** Because "Next" is a plain
> `<Link>`, a student who clicks through to read ahead starts every question's 100 s clock at once and can
> return to find them expired. The start screen does not warn about this.

### Anti-cheat
`TabSwitchMonitor` listens for `visibilitychange` and `blur`, de-duplicated by an `awayRef` latch so one
alt-tab firing both events counts once. It calls the `reportTabSwitch` **server action**, which is the sole
authority: it increments `tabSwitchCount`, logs a `QuizAttemptEvent`, and on `count > 2` sets
`status: FAILED, score: 0, failureReason: "Excessive tab switching"`. The client only displays the returned
number.

Known limits, honestly: it cannot see a second physical device, and a student who blocks JS simply never
reports — so this deters casual switching rather than preventing cheating. `reportTabSwitch` is also
unthrottled and writes a row per call. `WINDOW_BLUR` is declared in the enum but never written; every event
is logged as `TAB_HIDDEN`.

### Scoring and ArenaPoints
"ArenaPoints" is just the **sum of `QuizAttempt.score`** — there is no separate points table or multiplier.
`getCumulativeLeaderboard(programId)` recomputes it live on every call:
- roster = students **currently** in that program
- attempts counted = `status ∈ {COMPLETED, FAILED}` **and** `homework.subject.programId === programId`
- FAILED attempts contribute 0 to the score but **do** count toward "quizzes taken"
- ties broken alphabetically by last name, then first name

**Program-change policy** (documented at `quiz.ts:72-93`): an attempt is never re-attributed. Nothing is
deleted, but past attempts stop counting toward any leaderboard once the student leaves that program. Their
full history stays visible on their own profile and on the admin's student-detail page.

## D. Leaderboards and statistics

| Surface | Scope | Shows |
|---|---|---|
| `/dashboard` stat cards | student's current program | total points, quizzes completed, rank |
| `/dashboard/leaderboard` | student's current program | full ranked board with classmates' real names, own row highlighted |
| `/admin/leaderboard` | selected program (Super Admin can switch) | same board |
| `/admin/quizzes/[id]/results` | one quiz | every attempt: status, score, tab switches, failure reason |
| `/admin/students/[id]` | one student, **all programs** | full lifetime history — deliberately broader than the leaderboard, as an audit trail |
| `/dashboard/profile` | student's current program | total + count, matching the leaderboard exactly |

Nothing is cached — all totals are computed from stored rows on every request, a stated design principle.
Consistency note: the dashboard's "Quizzes completed" uses the program-scoped
`leaderboardEntry.completedQuizzes`, while the "Completed quizzes" *list* below it shows full cross-program
history. That is intentional and commented, but it means the number and the list length can differ.

## E. HootArena
See `HOOTARENA_ARCHITECTURE.md` for the full treatment. Business rules in brief: anonymous nickname +
6-digit PIN or QR, no account and no program/group targeting (access control is "whoever the host shares
the PIN with"); fixed 20 s per question; 1000 base points scaled 100%→50% by answer speed; incorrect,
partial and over-selected answers all score 0 (no partial credit); one answer per question, no changes;
students see only their own score plus the top 3, hosts see everything; games are editable only while in
LOBBY.

## F. INCO and bug reports

### INCO — anonymous student↔Super-Admin messaging
The anonymity guarantee is **structural**: `IncoSubmission` has no relation to any other model, so there is
no column to join through even with full database access. Only `codeHash` (SHA-256 of the reference code)
is stored, never the code. No IP or user agent is captured anywhere; the rate limiter deliberately keys on
a random cookie rather than an IP, for exactly this reason.

Flow: a logged-in student submits a category + message (≤3000 chars) at `/dashboard/inco` → receives a
20-character reference code **shown once** → `/inco/status` (fully public, no login) looks the code up by
hash. Being logged in gates who may *open the form*; the submission still stores nothing linking back.
Super Admin only reads/answers; answering a `NEW` submission auto-advances it to `IN_PROGRESS`. Rate
limits: 5 submissions / 10 min, 10 status checks / 10 min. UI is entirely in Georgian.

Trade-off the UI states honestly to the student: anonymity cannot be guaranteed if they identify themselves
in the message text.

### Bug reports
Student files a description (≤2000 chars) plus **≤2 images ≤3 MB each**, validated by **magic bytes**
(`sniffImageContentType`) — PNG/JPEG/GIF/WEBP — never by extension or `File.type`. Bytes are stored in
`BugReportAttachment.data` (Postgres `BYTEA`) because Cloud Run's filesystem is ephemeral.
`next.config.ts` raises the Server Action body limit to 8 MB to accommodate this.

Ownership is always the session's own `studentId`; the client cannot set it. `/attachments/[id]` serves
bytes to the owning student or any logged-in admin, returning an identical 404 for both "missing" and
"forbidden" so ids cannot be probed. Statuses: `OPEN → IN_PROGRESS → RESOLVED`, settable by **either**
admin level.

**Bug reports are the one feature with no program isolation** — list, detail, status mutation and the nav
badge count are all global.

## G. Themes and responsive design
See `DESIGN_SYSTEM.md`. In brief: dark is the unqualified `:root` default, light is a
`[data-theme="light"]` override; `ThemeInitScript` applies the stored choice **before first paint** via
`strategy="beforeInteractive"`, so there is no flash; `ThemeToggle` reads the real theme from the DOM on
mount and persists to `localStorage` inside a `try/catch`. The toggle is **absent from every legacy and
HootArena route** — those pages still render (dark is the default) but offer no switch.

## H. Other systems

- **Legacy LIVE** — host-driven Kahoot clone. Join by name + code, no account. Speed-scaled scoring
  (`0.5 + 0.5 × remainingFraction`). Host controls start/next/end/**restart** (restart deletes every answer
  for the homework). Students see the **full** leaderboard at each reveal. Supports PARAGRAPH questions,
  which are manually graded afterwards. Mid-question server restart recovers into REVEAL.
- **Legacy ASYNC** — self-paced, server-rendered, no sockets. Full points for correct answers, no speed
  bonus. Resumes at `min(answeredCount, total-1)`; finishing sets `Student.finishedAt`.
- **Public no-login homework creation** (`/homeworks/new`) — anyone can create a LIVE/ASYNC homework and
  manage it via a `creatorToken` cookie. Deliberate (commit `e7ffae9`), but unauthenticated and
  unthrottled, and the entry point for the most serious security finding.
- **Paragraph grading** (`/homeworks/[id]/grade`) — manual verdict + points, which feed the legacy
  leaderboard's `pendingGrading` count.
- **QR codes** — generated server-side as PNG data URLs in brand violet on white (violet-on-black would
  not scan reliably), downloadable, for both legacy join codes and Hoot PINs. All of them embed
  `NEXT_PUBLIC_BASE_URL`.

### Unfinished or vestigial
`WINDOW_BLUR` enum value (never written) · `QUIZ_QUESTION_POINTS` (never consumed) ·
`HootLeaderboard.highlightPlayerId` (never passed) · three dead lib exports · HootArena has **no history
UI** — finished games stay in the database but there is no browsing surface, which the schema comment says
was a deliberate scope decision · no error/loading/not-found boundaries anywhere · no admin-side view of
legacy ASYNC per-student progress beyond the leaderboard.
