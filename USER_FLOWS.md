# USER_FLOWS — SkillArena

> End-to-end traces, each step naming the page/action, the server logic, the models
> touched, and the authorization checks. Audit date 2026-10-14, commit `0f1d23d`.
> Traced by reading code; **not** executed in a browser (the local dev database was
> not running — see TESTING_AND_DEPLOYMENT.md).

---

## STUDENT

### 1. Login
| | |
|---|---|
| Page | `src/app/login/page.tsx` |
| Action | `login` (`src/app/login/actions.ts:6`) |
| Logic | `verifyStudentCredentials` → `createStudentUserSession` |
| Models | `User` (read) |
| Checks | username lowercased; `role` must be `STUDENT`; scrypt + `timingSafeEqual` |
| Errors | invalid → `?error=invalid`; identical message for bad user and bad password |
| Session | `studentUser` sub-session written into `__session`, 14-day TTL, embeds `sessionVersion` |
| Redirect | `from` honoured only if it starts with `/dashboard` or `/quiz` (open-redirect guard) |
| ⚠️ Risk | **No rate limiting** — unlimited password guessing (finding #2) |

### 2. Dashboard / program + group state
| | |
|---|---|
| Page | `src/app/dashboard/page.tsx`, layout `dashboard/layout.tsx` |
| Logic | `getCurrentStudent` → `eligibleHomeworkWhere` → parallel queries |
| Models | `User`, `Program`, `Homework`+`_count(questions)`+`Subject`, `QuizAttempt`, `StudentSubjectGroup` |
| Checks | middleware → layout re-check → `programId` present → eligibility fragment |
| Branches | no program → "No program assigned yet" (DB-unreachable for students, see DATA_MODEL.md); subjects with `groupId = null` → "no group yet" notice, no quizzes |
| Shows | Total points, Quizzes completed, Current rank (all program-scoped), available vs completed quizzes, leaderboard preview |

### 3. Quiz discovery → start
| | |
|---|---|
| Page | `src/app/quiz/[id]/page.tsx` (start screen) |
| Action | `startQuiz` (`quiz/[id]/actions.ts:32`) |
| Logic | `getVisibleQuiz` → `status === "OPEN"` → existing attempt? → `isStudentEligibleForQuiz` |
| Models | `Homework`, `Question`, `Option`, `QuizAttempt`, `StudentSubjectGroup`, `QuizTargetGroup`, `Subject`, `User` |
| Checks | **Eligibility re-verified here, not just at listing** — URL guessing cannot start an out-of-scope quiz (`:42-46`). Program match, group membership, and target-group membership all required. |
| Branches | already finished → "already completed" + link to result; in progress → "Resume quiz" |
| Models written | `QuizAttempt` (one row, `@@unique` guarantees singularity under races) |
| Redirect | `/quiz/[id]/q/0` |

### 4. Answering and navigation
| | |
|---|---|
| Page | `src/app/quiz/[id]/q/[index]/page.tsx` + `QuestionClientControls` + `TabSwitchMonitor` + `QuizTimer` |
| Action | `selectAnswer` (`quiz/[id]/actions.ts:52`), `reportTabSwitch` (`:73`) |
| Logic | `requireActiveAttempt` → `getOrCreateAttemptAnswer` (creates the fixed `deadlineAt` on first render) → update only if `Date.now() < deadlineAt` |
| Models | `AttemptAnswer` (upsert/update), `QuizAttempt`, `QuizAttemptEvent` |
| Checks | attempt must exist, belong to this student, and be `IN_PROGRESS`; index must be an integer in range (else redirect to start); past-deadline selections silently ignored |
| Navigation | "Previous" / "Next" both available; last question → "Review answers" |
| Anti-cheat | every departure → `reportTabSwitch`; 3rd → `FAILED`, `score: 0`, `completedAt` set |
| ⚠️ Risk | rendering a question **starts its clock**, so skimming ahead runs all timers at once (finding #5) |

### 5. Review → submit
| | |
|---|---|
| Page | `src/app/quiz/[id]/review/page.tsx` + `SubmitQuizButton` |
| Action | `submitQuizAttempt` (`quiz/[id]/actions.ts:103`) |
| Logic | load all `AttemptAnswer`s → for each question compare `selectedOptionId` to the `isCorrect` option → `score += 1` → `$transaction([...answer updates, attempt → COMPLETED])` |
| Models | `AttemptAnswer` (write `isCorrect`), `QuizAttempt` (status/score/completedAt) |
| Checks | `requireActiveAttempt` again; unanswered and past-deadline questions simply score 0 |
| Cache | `revalidatePath("/dashboard")` and `/dashboard/leaderboard` |
| Redirect | `/quiz/[id]/result` |

### 6. Result → leaderboard → logout
| | |
|---|---|
| Pages | `quiz/[id]/result/page.tsx`, `dashboard/leaderboard/page.tsx` |
| Logic | `FAILED` → dedicated "QUIZ FAILED" screen with reason + switch count + score 0; `COMPLETED` → animated score (`CountUp`) + per-question breakdown + program leaderboard |
| Guard | `IN_PROGRESS` → redirected back to `/quiz/[id]/q/0` (cannot peek at a result early) |
| Logout | `logout` (`dashboard/actions.ts:6`) → `destroyStudentUserSession` → `/login`. Removes **only** the `studentUser` key; legacy/Hoot sub-sessions in the same cookie are intentionally preserved. |

### 7. Student side-flows
- **Profile** (`/dashboard/profile`) — change username (uniqueness checked, session
  refreshed, `sessionVersion` untouched) or password (≥8 chars, **no current-password
  check**, `sessionVersion` bumped → signed out everywhere → `/login?passwordChanged=1`).
- **Bug report** (`/dashboard/bug-reports/new`) — description + up to 2 screenshots,
  magic-byte validated, stored as DB bytes.
- **INCO** (`/dashboard/inco`) — pick category + message → receive a 20-char code.
  The row has no link back to the student. Status later checked at public `/inco/status`.

---

## ADMIN (regular)

### 1. Login → dashboard
| | |
|---|---|
| Pages | `admin/login/page.tsx` → `admin/(dashboard)/layout.tsx` → `admin/(dashboard)/page.tsx` |
| Action | `login` (`admin/login/actions.ts:6`) — `verifyAdminCredentials` accepts `ADMIN` **and** `SUPER_ADMIN`; the level distinction is a later permission check |
| Session | `admin` sub-session, **12-hour** TTL |
| Layout | re-checks `getCurrentAdmin()`; renders the program badge; shows the INCO link and unread count **only** for Super Admin |
| ⚠️ Risk | **No login rate limiting** (finding #2) |

### 2. Program scoping (applies to every admin view)
`resolveAdminProgramScope(admin, requested)` — a regular Admin is pinned to their own
`programId` and any `?program=` param is ignored; Super Admin may switch via
`ProgramSelector`. Re-checked per resource at every mutation.

### 3. Student management
| | |
|---|---|
| Pages | `/admin/students` (list), `[id]` (detail), `[id]/edit`, `[id]/attempts/[attemptId]` |
| Actions | `students/actions.ts` — `createStudent`, `updateStudent`, `changeStudentProgram` (Super-Admin-only, `:154`), `setStudentPassword`, `resetStudentPassword`, `deleteStudent` |
| Guard | `requireAdminForStudent` → 404 if the student is in another program (`:31`) |
| Models | `User`, `Program`, `Subject`, `Group`, `StudentSubjectGroup`, `QuizAttempt` |
| Subject/group assignment | three-valued per subject: unassigned / assigned-no-group (`""`) / a real group id; group ids validated against the subject's own groups (`parseSubjectGroupAssignments`) |
| Password reset | generates a readable 10-char temp password, bumps `sessionVersion` (signs the student out everywhere) |
| ⚠️ Risks | plaintext password echoed in the redirect URL (finding #3); the **attempts page performs no admin/program check of its own** (finding #1) |

### 4. Quiz creation → publish → results
| | |
|---|---|
| Pages | `/admin/quizzes`, `new`, `[id]`, `[id]/questions/new`, `[id]/questions/[qid]/edit`, `[id]/results` |
| Actions | `quizzes/actions.ts` — `createQuiz`, `updateQuizDetails`, `updateQuizTargeting`, `setQuizStatus`, `deleteQuiz`, `createQuizQuestion`, `updateQuizQuestion`, `deleteQuizQuestion`, `moveQuizQuestion` |
| Guard | `requireQuizAccess` → 404 unless Super Admin or `quiz.subject.programId === admin.programId` |
| Create | subject must exist **and** belong to the submitted program; `joinCode` generated with up to 5 collision retries; `ownerUserId` set |
| Questions | exactly 4 options, exactly 1 correct; reorder via `moveQuizQuestion` |
| Publish | `setQuizStatus("OPEN")` requires subject + ≥1 target group + ≥1 question, else `?error=publish` |
| Models | `Homework`, `Question`, `Option`, `QuizTargetGroup`, `Subject`, `Group` |
| Delete | cascades to every `Question`, `QuizAttempt`, `AttemptAnswer` — confirmed by an explicit `window.confirm` warning |

### 5. Admin side-flows
- **Leaderboard** (`/admin/leaderboard`) — `getCumulativeLeaderboard(programId)`, program-scoped.
- **Bug reports** (`/admin/bug-reports`, `[id]`) — status filter + transitions.
  **Not program-scoped** (deliberate): any admin sees any report.
- **HootArena** (`/admin/hootarena/*`) — create game, manage questions, host live.
  Access is **ownership**-based (`canAdminManageGame`), not program-based.
- **Profile** (`/admin/profile`) — same username/password semantics as the student
  profile, including no current-password check.
- **Logout** → `destroyAdminSession` → `/admin/login`.

---

## SUPER ADMIN

Everything a regular Admin can do, un-scoped, plus:

### 1. Program management
`/admin/programs`, `/admin/programs/[id]` — `programs/actions.ts`, every action behind
`requireSuperAdmin`. Creates programs (with their own `groupCount`) and subjects;
creating a subject materialises `groupCount` groups named `Group I…`. Neither programs
nor subjects have a delete workflow, by design.

### 2. Administrator management
`/admin/admins` — `admins/actions.ts`:
- `createAdminAccount` — username ≤40 chars, password ≥8 + confirmation, **program
  mandatory and validated**, username uniqueness, `MAX_ADMINS = 8` re-checked
  immediately before the write; always `role: "ADMIN"`.
- `changeAdminProgram` / `deleteAdminAccount` — both filter `role: "ADMIN"`, making it
  structurally impossible to touch the Super Admin.
- Page 404s entirely for non-Super-Admins.
- ⚠️ Deleting an admin who has hosted a HootArena game **throws** (`HootGame.hostId`
  is `onDelete: Restrict`, no try/catch, no error boundary) — finding #8.

### 3. Program-context switching
`ProgramSelector` sets `?program=<id>`; `resolveAdminProgramScope` validates it
against the DB and honours it **only** for Super Admin. Drives `/admin/students`,
`/admin/quizzes`, `/admin/leaderboard`.

### 4. INCO review
`/admin/inco`, `/admin/inco/[id]` — Super-Admin-only (`notFound()` otherwise).
Set status (`NEW`/`IN_PROGRESS`/`RESOLVED`) and write a `response` the student later
reads via their code. The reviewer cannot learn who submitted it — there is no
column to join through.

### 5. Student program reassignment
`changeStudentProgram` (`students/actions.ts:154`) is Super-Admin-only. Documented
policy: past attempts stay attributed to the program of the quiz taken, so they
silently stop counting toward either leaderboard while remaining visible on the
student's own detail page.

---

## OTHER FLOWS

### HootArena live game (anonymous)
1. Admin creates a game + questions → `/admin/hootarena/[id]` → PIN + QR.
2. Admin opens `/admin/hootarena/[id]/host` → `HootHostClient` connects to the
   `/hootarena` Socket.IO namespace; `verifyHootAdmin` validates the cookie **and**
   `sessionVersion`, then `canAdminManageGame`.
3. Player opens `/hootarena/join/[pin]` → picks a nickname → rate-limited (10/min)
   → `HootPlayer` row (idempotent on `(gameId, username)`) → `clientToken` cookie.
4. `/hootarena/play/[id]` → `HootPlayClient` → `player:join`, identity fixed on
   `socket.data`.
5. Host drives `host:start` / `host:next` / `host:end`; server emits
   `phase:question` → `phase:reveal` → `phase:leaderboard`.
6. `player:answer` — server-authoritative: phase + question id + dedup set +
   independent deadline check (20 s + 500 ms) + option-id validation →
   `$transaction([HootResponse.create, HootPlayer.score increment])`.
7. Reconnect mid-game re-runs `player:join` and resumes; `connected` is soft state.

### Legacy LIVE / ASYNC (no accounts)
`/homeworks/new` (**unauthenticated** — finding #6) → `creatorToken` cookie →
`/homeworks/[id]` manage → `/homeworks/[id]/host` → students `/join` by code →
`/play/[homeworkId]`. Management gated by `canManageHomework` (admin **or** matching
creator token). Speed-based scoring via `src/lib/scoring.ts`. Paragraph answers are
graded manually at `/homeworks/[id]/grade`.

### Public INCO status check
`/inco/status` — no login. Code → SHA-256 → single-row lookup. Rate-limited
10/10 min per anonymous browser cookie.

### Bug-report attachment fetch
`/attachments/[id]` — self-authorizing route handler (middleware does not cover it):
owner student **or** any logged-in admin; otherwise an indistinguishable 404.

---

## Cross-cutting failure points found while tracing

| # | Flow | Issue |
|---|---|---|
| 1 | Admin → student attempt detail | no admin/program check on the page itself |
| 2 | Student & admin login | no rate limiting |
| 3 | Admin → reset/set student password | plaintext password in the URL |
| 4 | Profile → change password | no current-password verification |
| 5 | Student → answering | rendering a question starts its timer; skimming burns all clocks |
| 6 | Legacy → create homework | unauthenticated, unthrottled write endpoint |
| 7 | Theme | toggle missing on legacy + HootArena routes |
| 8 | Super Admin → delete admin | unhandled `Restrict` violation if they hosted a HootArena game |

Full detail, severity and reproduction in **CURRENT_STATE.md**.
