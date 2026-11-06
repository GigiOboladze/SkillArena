> **STATUS (2026-11-06): most of this has been FIXED.** This file is the original audit and
> describes the state at commit `0f1d23d`, kept as the historical record and rationale. For what was
> actually changed, why, and the measured results, see `FIXES_APPLIED_2026-11.md` in this folder.

# Known Issues and Technical Debt

20 findings. **Confirmed** = established by reading the code, with the mechanism traced. **Risk** = a real
weakness whose practical impact I could not measure. Nothing here was reproduced at runtime — the local
database was not running (see `TESTING_AND_QUALITY_AUDIT.md`).

**[prior]** = already in the repo's `CURRENT_STATE.md` (2026-10-14); I re-verified each.
**[new]** = found in this investigation, in files that audit states it did not read.

Security findings are detailed in `SECURITY_AUDIT.md` and only cross-referenced here.

---

## Confirmed functional bugs

### F1 — An in-progress quiz attempt vanishes from the dashboard **[new]**
`src/app/dashboard/page.tsx:42-43`
```ts
const availableQuizzes = publishedQuizzes.filter((q) => !attemptByQuiz.has(q.id)); // drops STARTED quizzes
const finishedAttempts  = attempts.filter((a) => a.status !== "IN_PROGRESS");      // drops them again
```
A half-finished quiz appears in **neither** list and is linked from nowhere. The resume path exists and
works — `/quiz/[id]` renders a "Resume quiz" button (`quiz/[id]/page.tsx:75`) — it is simply unreachable
unless the student still has the URL.

Who this hits: anyone who closes the tab mid-quiz, which is exactly the population the 100 s-deadline and
anti-cheat design expects to come back. **Highest user-visible impact of anything in this list.**
Fix: a third "In progress" section, or include started quizzes in `availableQuizzes` with a different CTA.

### F2 — `score` can exceed `totalQuestions` ("5 / 3") **[new]**
`startQuiz` snapshots `totalQuestions: quiz.questions.length` (`quiz/[id]/actions.ts:48`).
`createQuizQuestion` (`quizzes/actions.ts:165`) has **no status or attempt guard**, so an admin can add
questions to an `OPEN` quiz that already has attempts. `submitQuizAttempt` then scores against the quiz's
*current* questions while the result page (`result/page.tsx:50`) and dashboard (`:137`) display
`attempt.score / attempt.totalQuestions`.

Add 2 questions after a student starts a 3-question quiz and a perfect score renders as "5 / 3". Note
`deleteQuizQuestion` *does* guard the OPEN case (for the unrelated zero-question-trap reason) while
`createQuizQuestion` guards nothing.
Fix options: block adding questions once attempts exist, or recompute `totalQuestions` at submission, or
display the live question count. The first preserves fairness best.

### F3 — Adding a HootArena question after deleting a middle one crashes **[new]**
`createHootQuestion` sets `order = count(gameId)` (`hootarena/actions.ts:148`); `deleteHootQuestion`
(`:190`) never renumbers survivors. Orders `0,1,2` → delete `1` → rows `{0,2}`, `count = 2` → the new
question is created with `order = 2`, violating `@@unique([gameId, order])` (migration
`20261001120000`) → unhandled Prisma **P2002** → Next's raw error page.

The legacy `Question` model has no such unique index, so the identical `order = count()` logic there
instead produces **silent duplicate orders** — an ambiguous question sequence rather than a crash.
Fix: `order = (max(order) ?? -1) + 1`, or renumber on delete.

### F4 — Legacy LIVE never re-joins after a reconnect **[new]**
`src/app/play/[homeworkId]/LiveGame.tsx:45` emits `lobby:join` **once, inline in the mount effect**, with
no `socket.on("connect", join)`. Socket.IO reconnects transparently after a network blip or tab suspend
and hands the server a brand-new socket with none of the old `socket.data` or room membership — so the
client looks connected, receives nothing further, and needs a manual refresh. `HostClient.tsx:37` has the
same gap.

Both HootArena clients fix exactly this (`HootPlayClient.tsx:55-66`, `HootHostClient.tsx:42-53`), each with
a comment describing the failure mode; commit `ff11b96`'s "fix reconnect gap" covered only the new system.
There is also **no `disconnect` handler at all** in the legacy namespace (server.ts's connection block ends
at :550), so legacy lobbies never reflect departures.
Fix: copy the four-line HootArena pattern.

### F5 — Deleting an admin who hosted a HootArena game throws **[prior]**
`HootGame.host` is `onDelete: Restrict` (`schema.prisma:531`); `deleteAdminAccount`
(`admins/actions.ts:83`) calls `prisma.user.deleteMany` with **no `try/catch`**, and there is no
`error.tsx` anywhere. So the FK error surfaces as Next's unstyled default error screen. Deterministic given
the schema; not reproduced (no database).
Fix: catch it and redirect with a clear message, or reassign/soft-delete the games.

### F6 — Quiz timers start when a question is merely *viewed* **[prior]**
`getOrCreateAttemptAnswer` runs **during page render** (`q/[index]/page.tsx:28`), fixing
`deadlineAt = now + 100 s` the first time a question is *displayed*. Because "Next" is a plain `<Link>`, a
student who clicks through to read ahead **starts every question's clock simultaneously** and can return to
find most of them expired. The start screen says only "You can move between questions and change answers
before you submit", with no warning.

There is also **no overall attempt deadline** — only per-question clocks — so total wall-clock time per
attempt is unbounded. Plausibly the cause of any "students ran out of time" complaint.
Fix: start the clock on first *answer* interaction, or warn explicitly on the start screen.

### F7 — Four `react-hooks/set-state-in-effect` lint errors **[new]**
`npx eslint` **fails**: 8 errors, 3 warnings (full list in `TESTING_AND_QUALITY_AUDIT.md`). Four are
`setState` called synchronously in an effect body — `CountUp.tsx:15`, `QuizTimer.tsx:24`,
`TabSwitchMonitor.tsx:37`, `ThemeToggle.tsx:19` — all the "sync state from a prop/DOM" pattern, each
causing an avoidable extra render. Four more are raw apostrophes in JSX
(`react/no-unescaped-entities`).

These errors are on **committed** code, which tells you lint is not in CI or a pre-commit hook. `next build`
does not run ESLint in Next 16, which is why a green build coexists with failing lint.

---

## Confirmed security findings
Summarised; full detail and exploit paths in `SECURITY_AUDIT.md`.

| ID | Finding | Severity |
|---|---|---|
| S1 **[new]** | Unauthenticated cross-homework question delete / answer grading (3 legacy actions) | HIGH |
| S3 **[new]** | Legacy LIVE host events act on the payload's `homeworkId`, incl. destructive `host:restart` | MED-HIGH |
| S5 **[prior]** | No rate limiting on either login action (also a scrypt CPU-DoS on a single instance) | MED-HIGH |
| S6 **[prior]** | Plaintext passwords in redirect URLs | MED-HIGH |
| S2 **[new]** | Same IDOR in 4 admin question actions | MEDIUM |
| S4 **[prior]** | Cross-program leak on `/admin/students/[id]/attempts/[attemptId]` | MEDIUM |
| S7 **[prior]** | Password change needs no current password (intentional) | MEDIUM |
| S8 **[prior]** | Unauthenticated, unthrottled homework creation | MEDIUM |
| S9 **[new]** | Bug reports have no program isolation | LOW-MED |
| S10 **[new]** | Rate limiter keyed by a clearable client cookie | LOW |
| S11 **[new]** | `selectAnswer` validates neither `questionId` nor `optionId` | LOW |

---

## Risks (real, impact unmeasured)

### R1 — No error, loading or not-found boundaries anywhere **[prior]**
Verified: **zero** `error.tsx`, `global-error.tsx`, `not-found.tsx`, `loading.tsx` in all of `src/app`.
Combined with **no `try/catch` in any admin or dashboard server action**:
- every unexpected failure (F3, F5) renders Next's unstyled default error page, potentially with a Prisma
  message;
- `notFound()` is used heavily, so every 404 is the generic off-brand Next page;
- no route has a skeleton — navigations block on the server render.

This is the **best value-for-effort improvement in the codebase**: three files, no behavioural risk.

### R2 — In-memory state is never pruned **[new]**
`liveStates` (server.ts:77) and `hootStates` (server.ts:137) gain an entry per homework/game and **never
delete one**, even after FINISHED. Each holds Sets, Maps and cached payloads. On a single long-lived
instance this grows monotonically with every game ever hosted since the last restart. Slow, but unbounded.
Fix: delete the entry on `finishGame`/`finishHootGame`, or add a TTL sweep.

### R3 — Leaderboard query cost grows with the roster **[new]**
`getCumulativeLeaderboard` (`quiz.ts:94`) loads **every student in the program with all their matching
attempts**, then sums in JS. It is called on `/dashboard` (plus a second time per quiz result page), the
student leaderboard, the admin leaderboard, and the student profile. At ~350 students × N attempts this is
fine; it is an O(students × attempts) fetch-and-reduce on every page view, with no index on
`(studentId, status)`.
Fix when needed: a `groupBy` aggregate in SQL, or a periodically materialised total.

### R4 — `DATABASE_URL` connection limit vs. a class-sized burst
`.env.example` documents keeping `connection_limit` capped for pooled URLs, and the local `.env` uses 10.
Project memory records production having been set to `5`, flagged as a likely bottleneck under real
concurrent load and **not yet changed**. A live HootArena game with 30+ players answering within the same
second issues a burst of transactions; exceeding the pool surfaces as "Can't reach database server".
**UNVERIFIED** — I could not inspect the production environment.

### R5 — Single-instance ceiling is architectural, not tunable
Both game engines and the rate limiter keep state in process memory, so capacity is vertical only. Worth
stating plainly before any "just add a replica" suggestion: replicas would route students to a different
process from their host and silently break live games.

### R6 — Quiz status is not re-checked after an attempt starts **[new]**
`getVisibleQuiz` (`quiz.ts:14`) filters only `mode: "QUIZ"`, despite a docstring claiming it loads what the
student "is allowed to see (published)". `startQuiz` and `/quiz/[id]` do check `status === "OPEN"`, but
`q/[index]`, `review`, `result`, `selectAnswer` and `submitQuizAttempt` do not — so an attempt continues
through a quiz being set back to DRAFT or CLOSED. Plausibly intentional (don't strand a mid-quiz student),
but undocumented and contradicted by the docstring. **Decide, then write it down.**

### R7 — Abandoned attempts are never closed **[new]**
Nothing ever transitions an `IN_PROGRESS` attempt (no cron, queue or scheduler exists). It stays
`IN_PROGRESS` forever, excluded from the leaderboard's `COMPLETED|FAILED` filter, and — per F1 —
invisible on the dashboard. Combined with one-attempt-ever, a student who abandons a quiz has silently
scored nothing with no path back.

### R8 — HootArena allows joining a game in progress **[new]**
`joinHootGame` blocks only `FINISHED` (`join/[pin]/actions.ts:15`). A late joiner enters with score 0 and
increments `totalPlayers`, which shifts the reveal screen's unanswered count mid-game. The host's
in-question "answered / total" additionally uses the **stale lobby snapshot** (`players.length`), because
`lobby:update` stops broadcasting past LOBBY — so host and reveal screens disagree.

### R9 — `reportTabSwitch` is unthrottled
One `QuizAttemptEvent` row per call, no rate limit, client-triggered.

### R10 — Anti-cheat is client-dependent by nature
`TabSwitchMonitor` cannot see a second physical device, and a student who disables JS never reports. The
code and comments are honest about this. It deters casual switching; it does not prevent cheating. Worth
stating plainly if SkillArena is demoed as having "anti-cheat".

### R11 — Node version skew
Local `v24.14.1`; `Dockerfile` pins `node:22-slim`. No incompatibility observed (`tsc` and `build` pass
locally) but local and production are not running the same major.

---

## Dead code and inconsistencies (inventory only — nothing deleted)

**Dead exports:** `getSubjectWithGroups`, `getStudentMemberships` + type `StudentMembership`
(`lib/subjects.ts`), `getProgram` (`lib/programs.ts`), `highlightPlayerId` prop
(`components/HootLeaderboard.tsx`), `computeHootPoints`'s optional `timeLimitSec` (every caller omits it).

**`QUIZ_QUESTION_POINTS` is a trap.** Declared in `lib/quiz-constants.ts:5` and re-exported by `quiz.ts`,
but **never consumed** — `submitQuizAttempt` hardcodes `score += 1`. The file presents itself as the quiz
rule configuration, so editing the constant looks like it should change scoring and does not.

**`WINDOW_BLUR` is a dead enum value** **[prior]** — declared in `schema.prisma:40` and its migration,
never written. `reportTabSwitch` always logs `TAB_HIDDEN`, so blur- and tab-hidden departures are
indistinguishable in the event log.

**Three stale comments describing the pre-rework HootArena** **[new]** — the schema's HootArena section
header (claims account-based + program/group eligibility, contradicted by the `HootGame` comment directly
below it), `server.ts:555-558` (same claim), and `hootarena/scoring.ts:57` (references a non-existent
`hootarena/questions.ts`). Commit `0f1d23d` changed the behaviour and missed the prose.

**Two more comment/code mismatches:** `getVisibleQuiz`'s docstring (R6), and `globals.css:10-16` claiming
the light theme's accent is orange when `--rahoot-red` stays violet there.

**Missing `server-only`:** `lib/scoring.ts` lacks it although every sibling has it and nothing in
`server.ts`'s import path requires its absence... except that `server.ts` *does* import
`computeMultipleChoicePoints` from it. So the omission is in fact necessary — but unlike
`session-core.ts`, `password.ts` and `hootarena/access.ts`, it carries **no comment saying so**, making it
look like an oversight.

**Props mutation** `[new]`: `QuizQuestionForm.tsx:29-30` and `QuestionForm.tsx:27-28` do
`const opts = defaults?.options ?? [...]; while (opts.length < 4) opts.push("")` — mutating an array
received as a prop. Harmless today (callers build it fresh each render) but a genuine anti-pattern.

**Hardcoded colour:** `AnswerTiles.tsx:37` uses `text-[#fbfaff]` where every other call site uses
`text-[color:var(--on-primary)]`.

**Theme toggle missing** on all `/join`, `/play/*`, `/homeworks/*`, `/my-homeworks` and `/hootarena/*`
routes **[prior]** (verified by import scan).

**Retired deploy config still present:** `firebase.json` + `.firebaserc`, `deploy/Caddyfile` +
`deploy/rahoot.service`. Only `Dockerfile` is live. Keep `firebase.json` in mind — it is the historical
reason for the single-`__session`-cookie design, and the reason S10's separate cookies would break there.

**Naming debt:** `package.json` name is `rahoot`; CSS tokens are `--rahoot-red` (violet). Cosmetic, but
`--rahoot-*` are used as Tailwind utility classes everywhere, so renaming is a wide mechanical change.

**Prisma drift hazard:** `users_single_super_admin` (partial unique index) and
`users_program_required_check` (CHECK) exist **only as raw SQL in migrations** and are invisible to
`schema.prisma`. A future `prisma migrate dev` can generate a migration that drops them. Review any
generated migration for `DROP INDEX`/`DROP CONSTRAINT` on those names before applying.

---

## Prioritised remediation

**Tier 1 — do first (tiny, high value, no behavioural risk).** Each is a one-line `where`-clause or
four-line guard with an existing correct pattern to copy.
1. S1 — add `homeworkId` to the three legacy child-id `where` clauses
2. S3 — add `socket.data.homeworkId !== homeworkId` to the four legacy host handlers
3. S2 — add the parent id to the four admin question actions
4. S4 — add the program guard to the attempt-detail page
5. R1 — add `error.tsx`, `not-found.tsx`, `loading.tsx`

**Tier 2 — small, user-visible.**
6. F1 — show in-progress attempts on the dashboard
7. F3 — fix `order` derivation in both question-create paths
8. F4 — add reconnect re-join to the two legacy clients
9. S5 — rate-limit both logins
10. F2 — resolve the `totalQuestions` drift

**Tier 3 — needs a decision before coding.**
11. S6 — get passwords out of URLs (needs a flash mechanism)
12. R6 / R7 — define the policy for mid-attempt unpublish and abandoned attempts
13. S9 — decide whether bug reports are global or program-scoped, and document it
14. F6 — decide when a question's clock should start
15. S7 — current-password requirement (product decision)

**Tier 4 — hygiene.**
16. F7 — fix the 8 lint errors and put lint in CI
17. R2 — prune in-memory state on game completion
18. Fix the stale comments and the `QUIZ_QUESTION_POINTS` trap
19. Add an audit log for destructive admin actions
20. Add security headers
