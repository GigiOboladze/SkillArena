# API and Backend Map

SkillArena has almost no HTTP API. Mutations are **58 Server Actions** across 26 files; there is exactly
**one** route handler; real-time traffic goes over **two Socket.IO namespaces**.

## Route handlers (1)

| Route | Method | Auth | Notes |
|---|---|---|---|
| `/attachments/[id]` | GET | self-authorising: owning student **or** any logged-in admin | `src/app/attachments/[id]/route.ts`. Not covered by `proxy.ts`, so it checks itself. Returns an identical `404` for "not found" and "forbidden" so ids cannot be probed. Sets `Cache-Control: private, max-age=3600`. |

It exists because a Server Action cannot stream binary bytes.

## Server Actions

Legend — **Auth**: `SA` Super Admin · `A` any admin · `S` logged-in student · `anon` none required ·
`tok` bearer token in cookie (legacy student/creator/Hoot player).

### Admin — quizzes (`admin/(dashboard)/quizzes/actions.ts`)
Guard: `requireAdmin()` then `requireQuizAccess(admin, quizId)` (program via `quiz.subject.programId`).

| Action | Auth | Writes | Notes |
|---|---|---|---|
| `createQuiz(programId, fd)` | A | Homework | Validates the subject belongs to `programId`; generates a unique `joinCode` with 5 retries. |
| `updateQuizTargeting(quizId, fd)` | A | Homework.subjectId, QuizTargetGroup | Replaces the whole target set in a transaction. Retargeting is confined to the **same program** — never a back door to move a quiz. Filters submitted `groupIds` against the subject's real groups. |
| `updateQuizDetails(quizId, fd)` | A | Homework.title | |
| `setQuizStatus(quizId, status)` | A | Homework.status | `OPEN` requires subject + ≥1 target group + ≥1 question. |
| `deleteQuiz(quizId)` | A | **cascades** to questions, options, every attempt | |
| `createQuizQuestion(quizId, fd)` | A | Question + 4 Options | `order = count()`. No status guard — the `totalQuestions` drift bug. |
| `updateQuizQuestion(quizId, questionId, fd)` | A | Question, Options | ⚠ **`questionId` not verified against `quizId`** (IDOR). |
| `deleteQuizQuestion(quizId, questionId)` | A | Question (cascades) | ⚠ same IDOR. Refuses to take an `OPEN` quiz to zero questions. |
| `moveQuizQuestion(quizId, questionId, dir)` | A | two Question.order | ✅ safe — lists by parent and bails if `findIndex === -1`. |

### Admin — students (`admin/(dashboard)/students/actions.ts`)
Guard: `requireAdminForStudent(studentId)` → program check, or `requireAdmin` + explicit program compare.

| Action | Auth | Notes |
|---|---|---|
| `createStudent(programId, fd)` | A | Lowercases username, checks uniqueness, parses 3-state subject/group assignments, auto-generates a password if blank. ⚠ redirects with `?password=<plaintext>`. |
| `updateStudent(studentId, fd)` | A | Replaces all assignments in a transaction. **Never reads `programId` from the form.** |
| `changeStudentProgram(studentId, fd)` | **SA** | Clears assignments + changes program in one transaction. Never touches attempts. |
| `resetStudentPassword(studentId)` | A | Generates a password, bumps `sessionVersion`. ⚠ plaintext in URL. |
| `setStudentPassword(studentId, fd)` | A | Admin-chosen, ≥8 chars, confirmed. ⚠ echoes the admin's typed password back in the URL. |
| `deleteStudent(studentId)` | A | Cascades attempts + bug reports. |

### Admin — HootArena (`admin/(dashboard)/hootarena/actions.ts`)
Guard: `requireHootGameAccess` (`canAdminManageGame`: SA any / A own) + `requireHootGameEditable`
(LOBBY only).

`createHootGame` (title only — no program/subject) · `updateHootGameDetails` · `deleteHootGame` ·
`createHootQuestion` (⚠ `order = count()` collides with `@@unique([gameId, order])` after a middle delete) ·
`updateHootQuestion` / `deleteHootQuestion` (⚠ IDOR, same shape as above) · `moveHootQuestion` (✅ safe).

`parseHootQuestionForm` enforces: ≥2 filled options, every "correct" index among the filled ones, exactly
one correct for `SINGLE_CHOICE`, ≥1 for `MULTIPLE_CHOICE`, and exactly one of True/False for `TRUE_FALSE`.

### Admin — Super-Admin-only
| Action | File | Notes |
|---|---|---|
| `createAdminAccount(fd)` | `admins/actions.ts` | Role hardcoded `ADMIN`; program mandatory and verified; 8-slot cap counted server-side immediately before the write. |
| `changeAdminProgram(adminId, fd)` | `admins/actions.ts` | Filters `role: "ADMIN"` so the Super Admin is structurally unreachable. |
| `deleteAdminAccount(adminId)` | `admins/actions.ts` | Same filter. ⚠ No `try/catch` → FK error if that admin hosted a HootArena game (`HootGame.host` is `Restrict`). |
| `createProgram(fd)` | `programs/actions.ts` | `groupCount` clamped 1–10, default 3. |
| `createSubject(programId, fd)` | `programs/actions.ts` | Creates the subject **and** its fixed groups in one transaction, count from `Program.groupCount`. |
| `updateIncoStatus(id, status)` | `inco/actions.ts` | Whitelisted enum. |
| `respondToInco(id, fd)` | `inco/actions.ts` | Auto-advances `NEW → IN_PROGRESS`. |

### Admin — other
`updateBugReportStatus(reportId, fd)` — **any** admin, ⚠ **no program scoping at all** ·
`updateAdminUsername` / `updateAdminPassword` (self-service; password bumps `sessionVersion` and destroys
the session) · `logout` · `login` (⚠ unthrottled).

### Student
| Action | File | Notes |
|---|---|---|
| `startQuiz(quizId)` | `quiz/[id]/actions.ts` | Re-checks `status === "OPEN"` **and** eligibility; snapshots `totalQuestions`. |
| `selectAnswer(quizId, questionId, optionId, fd)` | " | `requireActiveAttempt`, then writes only if `Date.now() < deadlineAt`. ⚠ validates neither `questionId` against the quiz nor `optionId` against the question. |
| `reportTabSwitch(quizId)` | " | **Returns** `{tabSwitchCount, failed}`. Server owns the count and the fail decision. ⚠ unthrottled; one event row per call. |
| `submitQuizAttempt(quizId)` | " | Grades everything in one `$transaction`; marks COMPLETED. |
| `submitBugReport(fd)` | `dashboard/bug-reports/actions.ts` | ≤2 files, ≤3 MB each, magic-byte sniffed. Owner is always the session's student. |
| `submitIncoMessage(prev, fd)` | `dashboard/inco/actions.ts` | `useActionState` signature. Rate-limited 5/10 min. Returns the one-time code. |
| `updateStudentUsername` / `updateStudentPassword` | `dashboard/profile/actions.ts` | Password bumps `sessionVersion` + destroys session. |
| `logout`, `login` | | ⚠ login unthrottled. |

### Public / anonymous
| Action | Auth | Notes |
|---|---|---|
| `createHomework(fd)` | **anon** | By design (commit `e7ffae9`). Mints a `creatorToken`. ⚠ unauthenticated **and** unthrottled DB write. |
| `joinHomework(homeworkId, fd)` | anon | Requires `status === "OPEN"`. Creates a `Student` row + cookie. Unthrottled. |
| `goToJoinCode(fd)` / `goToHootPin(fd)` | anon | Pure redirect helpers; `goToHootPin` validates `/^\d{6}$/`. |
| `joinHootGame(gameId, fd)` | anon | Rate-limited 10/min. Case-insensitive nickname pre-check + unique-constraint catch. ⚠ allows joining a game already in progress (only `FINISHED` is blocked). |
| `checkIncoStatus(prev, fd)` | anon | Deliberately no session. Rate-limited 10/10 min. Lookup by SHA-256 hash. |
| `submitAsyncAnswer(hwId, qId, idx, total, fd)` | tok | ✅ **Scopes the question correctly** (`where: {id: questionId, homeworkId}`) — the counter-example to the IDOR bugs. |

### Legacy management (`homeworks/[id]/actions.ts`, `grade/actions.ts`)
Guard: `canManageHomework(homeworkId)` — admin **or** this browser's matching `creatorToken`.

`updateHomeworkDetails` · `setHomeworkStatus` · `deleteHomework` · `createQuestion` ·
⚠ `updateQuestion(homeworkId, questionId, fd)` and ⚠ `deleteQuestion(homeworkId, questionId)` — **the
most serious IDOR in the project**, reachable with no account · ⚠ `gradeAnswer(homeworkId, answerId, fd)` —
same shape, arbitrary `pointsAwarded` on any `Answer` row.

## Socket.IO

Path `/socket.io` for both namespaces. Contracts live in `src/lib/socket-events.ts` and
`src/lib/hootarena/socket-events.ts` so client and server cannot drift.

### Legacy LIVE — default namespace, room `hw:{homeworkId}`

Client → server:

| Event | Payload | Auth check |
|---|---|---|
| `lobby:join` | `{homeworkId, studentId, clientToken}` + ack | Row must match all three; `mode === "LIVE"` |
| `host:join` | `{homeworkId}` + ack | Cookie → admin, **or** `envelope.creators[homeworkId] === Homework.creatorToken` |
| `host:start` | `{homeworkId}` | ⚠ `socket.data.isHost` only |
| `host:next` | `{homeworkId}` | ⚠ same |
| `host:end` | `{homeworkId}` | ⚠ same |
| `host:restart` | `{homeworkId}` | ⚠ same — and it **deletes every answer** for that homework |
| `student:answer` | `{homeworkId, questionId, selectedOptionId?, textAnswer?}` | ✅ `socket.data.homeworkId === homeworkId` + phase + not-already-answered |

Server → client: `lobby:update`, `phase:question`, `phase:reveal` (**includes the full leaderboard, sent to
students**), `phase:finished`, `phase:lobby`, `answer:you` (targeted), `answer:count`, `error`.

### HootArena — `/hootarena` namespace, room `hoot:{gameId}`
See `HOOTARENA_ARCHITECTURE.md` for the full event table. Every host event checks
`socket.data.isHost && socket.data.gameId === gameId`, and the payload split
(`phase:reveal` vs `phase:reveal:host`, `leaderboard:you` vs `leaderboard:host`) is enforced in the type
system.

## Backend helper surface (`src/lib`)

The functions actions and pages actually call:

- **Auth:** `getCurrentStudent`, `getCurrentAdmin`, `getCurrentSuperAdmin`, `getAdminSession`,
  `verifyAdminCredentials`, `verifyStudentCredentials`, `create*/destroy*Session`
- **Eligibility:** `eligibleHomeworkWhere`, `isStudentEligibleForQuiz`, `getUngroupedSubjectAssignments`,
  `listSubjectsWithGroups`, `resolveAdminProgramScope`, `listPrograms`
- **Quiz:** `getVisibleQuiz`, `getAttempt`, `startOrGetAttempt`, `getOrCreateAttemptAnswer`,
  `remainingSeconds`, `getCumulativeLeaderboard`
- **Scoring:** `computeMultipleChoicePoints`, `getLeaderboard` (legacy); `computeHootPoints`,
  `isSelectionCorrect` (Hoot)
- **Hoot:** `generateUniqueHootPin`, `canAdminManageGame`, `loadHootGameForAdmin`,
  `setHootPlayerCookie`, `getHootPlayerForGame`
- **Support:** `createIncoSubmission`, `findIncoSubmissionByCode`, `hashIncoCode`,
  `sniffImageContentType`, `checkRateLimit`, `getIncoRateLimitKey`, `getHootRateLimitKey`
- **Misc:** `generateJoinCode`, `generateClientToken`, `hashPassword`, `verifyPassword`,
  `generateJoinQrDataUrl`, `generateHootJoinQrDataUrl`

## Cross-cutting backend conventions

1. **Validation is hand-rolled** — `String(formData.get("x") || "").trim()` everywhere; no Zod. Enum
   values are checked against explicit whitelist arrays (`VALID_STATUSES`, `VALID_TYPES`,
   `VALID_CATEGORIES`).
2. **Errors are reported by redirect**, not thrown: `redirect("…?error=taken")`, and the page maps the
   code to a message via an `ERROR_MESSAGES` record. Two actions break this pattern and return state
   instead, because they use `useActionState` (`submitIncoMessage`, `checkIncoStatus`).
3. **`redirect()` must never sit inside a `try`** — it works by throwing. The codebase has exactly one
   `try/catch` in `src/app` (`hootarena/join/[pin]/actions.ts:41`) and it is correctly shaped. Two commits
   (`c102b25`, `94f8694`) exist solely to fix earlier violations of this rule.
4. **Multi-row writes use `$transaction`** — targeting replacement, assignment replacement, question
   option replacement, Hoot answer + score increment.
5. **`revalidatePath` after every mutation**, including sibling surfaces (`/dashboard` is revalidated when
   an admin publishes a quiz).
6. **Guard naming is consistent:** `requireAdmin`, `requireSuperAdmin`, `requireQuizAccess`,
   `requireAdminForStudent`, `requireHootGameAccess`, `requireActiveAttempt`, `requireManage`. Follow this
   when adding actions — and make the guard take **every** id the action will touch, which is precisely
   what the IDOR bugs failed to do.
