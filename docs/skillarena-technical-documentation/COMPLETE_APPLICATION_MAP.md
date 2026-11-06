# Complete Application Map

Route table from `next build` (61 entries: 57 dynamic, 4 static).

## Route table

Auth legend: `SA` Super Admin · `A` any admin · `S` logged-in student · `tok` cookie bearer token ·
`anon` public.

### Public
| Route | Auth | Page file | Models read |
|---|---|---|---|
| `/` | anon | `app/page.tsx` (`force-dynamic`) | — |
| `/login` | anon | `app/login/page.tsx` | User (via action) |
| `/admin/login` | anon | `app/admin/login/page.tsx` | User (via action) |
| `/inco/status` | anon (**static**) | `app/inco/status/page.tsx` | IncoSubmission (via action, by hash) |
| `/attachments/[id]` | owner or any A | `app/attachments/[id]/route.ts` | BugReportAttachment, BugReport |

### Student (`proxy.ts`-gated, `getCurrentStudent` re-checked in layout)
| Route | Page file | Models |
|---|---|---|
| `/dashboard` | `dashboard/page.tsx` | User, Program, Homework, QuizAttempt, StudentSubjectGroup |
| `/dashboard/leaderboard` | `dashboard/leaderboard/page.tsx` | User, QuizAttempt |
| `/dashboard/profile` | `dashboard/profile/page.tsx` | User, Program, QuizAttempt, StudentSubjectGroup |
| `/dashboard/bug-reports` | `dashboard/bug-reports/page.tsx` | BugReport |
| `/dashboard/bug-reports/new` | `.../new/page.tsx` | — |
| `/dashboard/inco` | `dashboard/inco/page.tsx` | — (write-only) |
| `/quiz/[id]` | `quiz/[id]/page.tsx` | Homework, Question, Option, QuizAttempt |
| `/quiz/[id]/q/[index]` | `.../q/[index]/page.tsx` | + AttemptAnswer |
| `/quiz/[id]/review` | `.../review/page.tsx` | + AttemptAnswer |
| `/quiz/[id]/result` | `.../result/page.tsx` | + cumulative leaderboard |

### Admin (`proxy.ts`-gated, `getCurrentAdmin` re-checked in layout)
| Route | Auth | Program-scoped? |
|---|---|---|
| `/admin` | A | ✅ (SA sees all-program totals) |
| `/admin/quizzes`, `/new`, `/[id]`, `/[id]/results`, `/[id]/questions/new`, `/[id]/questions/[qid]/edit` | A | ✅ via `quiz.subject.programId` |
| `/admin/students`, `/[id]`, `/[id]/edit` | A | ✅ via `student.programId` |
| `/admin/students/[id]/attempts/[attemptId]` | A | ❌ **no check at all** (S4) |
| `/admin/leaderboard` | A | ✅ `resolveAdminProgramScope` |
| `/admin/hootarena`, `/new`, `/[id]`, `/[id]/host`, `/[id]/questions/*` | A | ownership, not program |
| `/admin/bug-reports`, `/[id]` | A | ❌ **global by design?** (S9) |
| `/admin/profile` | A | self only |
| `/admin/admins` | **SA** | n/a |
| `/admin/programs`, `/[id]` | **SA** | n/a |
| `/admin/inco`, `/[id]` | **SA** | n/a |

### HootArena (public player surface — NOT proxy-gated)
`/hootarena` (PIN entry) · `/hootarena/join/[pin]` (nickname) · `/hootarena/play/[id]` (`tok`, socket client)

### Legacy (no accounts; `homeworks/[id]/*` gated by its own layout via `canManageHomework`)
`/join`, `/join/[code]` (anon) · `/play/[homeworkId]`, `/q/[index]`, `/done`, `/leaderboard` (`tok`) ·
`/my-homeworks` (`tok`) · `/homeworks/new` (**anon**) · `/homeworks/[id]`, `/host`, `/grade`,
`/leaderboard`, `/questions/new`, `/questions/[qid]/edit` (A or creator `tok`)

---

## 1. Application architecture

```mermaid
flowchart TB
  subgraph Browser
    SC[Server-rendered pages]
    CI["Client islands (28)"]
    WS[socket.io-client]
  end

  subgraph "Node process (single instance)"
    direction TB
    HTTP[createServer] --> PX[proxy.ts middleware]
    PX --> RSC[Server Components]
    PX --> SA["Server Actions (58)"]
    HTTP --> RH["route handler: /attachments/[id]"]
    IO[Socket.IO]
    IO --> NS1["default ns -> liveStates Map"]
    IO --> NS2["/hootarena ns -> hootStates Map"]
    RL[rate-limit hits Map]
  end

  LIB["src/lib: session, quiz, subjects,<br/>programs, scoring, hootarena, inco"]
  DB[(PostgreSQL via Prisma)]

  SC --> HTTP
  CI --> SA
  WS --> IO
  RSC --> LIB
  SA --> LIB
  NS1 --> LIB
  NS2 --> LIB
  LIB --> DB
  RH --> DB
```

## 2. Database relationships
See the full ER diagram in `DATABASE_SCHEMA.md`. The shape in one line:
`Program → Subject → Group`, with `User` scoped to a Program, `StudentSubjectGroup` joining student↔subject
(one group each), `Homework` (three modes) owning `Question → Option`, attempts split between legacy
(`Student → Answer`) and SkillArena (`QuizAttempt → AttemptAnswer`), HootArena in six parallel tables, and
`IncoSubmission` deliberately connected to nothing.

## 3. Authentication and authorization flow
See `AUTHENTICATION_AND_PERMISSIONS.md` for the full diagram. Four layers: `proxy.ts` (signature only, no
DB) → layout (`getCurrent*`, DB `sessionVersion` check) → page (role + per-resource program check) →
server action (everything again, because it is a public endpoint).

## 4. Student workflow

```mermaid
flowchart TD
  L[/login/] --> D[/dashboard/]
  D -->|"eligible, not started"| QS[/quiz/id - start screen/]
  D -->|completed| RES[/quiz/id/result/]
  D -. "IN_PROGRESS: appears in NEITHER list (F1)" .-> X[unreachable]
  QS -->|startQuiz: re-check OPEN + eligibility| Q0[/quiz/id/q/0/]
  Q0 -->|"first view: deadlineAt = now + 100s, fixed"| Q0
  Q0 -->|selectAnswer, only before deadline| Q0
  Q0 -->|Next / timer expiry| QN[/quiz/id/q/n/]
  QN --> REV[/quiz/id/review/]
  REV -->|submitQuizAttempt: grade in one transaction| RES
  Q0 -->|"3rd tab switch -> FAILED, score 0"| RES
  D --> LB[/dashboard/leaderboard/]
  D --> BR[/dashboard/bug-reports/]
  D --> IN[/dashboard/inco/] --> CODE[one-time code] --> ST[/inco/status - no login/]
```

## 5. Admin workflow

```mermaid
flowchart TD
  AL[/admin/login/] --> AD[/admin/]
  AD --> QZ[/admin/quizzes/]
  QZ -->|createQuiz: subject must be in program| QD[/admin/quizzes/id/]
  QD -->|add questions: 4 options, 1 correct| QD
  QD -->|updateQuizTargeting: subject + groups| QD
  QD -->|"setQuizStatus OPEN: needs subject + >=1 group + >=1 question"| PUB[Published]
  PUB --> RESU[/admin/quizzes/id/results/]
  AD --> STU[/admin/students/]
  STU -->|createStudent + 3-state assignments| SD[/admin/students/id/]
  SD --> ATT[/admin/students/id/attempts/attemptId/]
  AD --> HA[/admin/hootarena/] --> HG[/admin/hootarena/id/] --> HOST[/admin/hootarena/id/host/]
  AD --> BRA[/admin/bug-reports/]
  AD --> LBA[/admin/leaderboard/]
```

## 6. Super Admin workflow

```mermaid
flowchart TD
  SA[/admin as SUPER_ADMIN/] --> PS[/admin/programs/]
  PS -->|createProgram: groupCount 1-10| PD[/admin/programs/id/]
  PD -->|createSubject: auto-creates groupCount fixed groups| PD
  SA --> AM[/admin/admins/]
  AM -->|"createAdminAccount: role forced ADMIN, max 8"| AM
  AM -->|changeAdminProgram / deleteAdminAccount - filtered role=ADMIN| AM
  SA --> IC[/admin/inco/] --> ICD[/admin/inco/id/] -->|respondToInco: NEW -> IN_PROGRESS| ICD
  SA -->|ProgramSelector ?program=id| ANY[any program's quizzes / students / leaderboard]
  SA --> SP[changeStudentProgram: clears assignments, keeps attempts]
```

## 7. Standard quiz lifecycle

```mermaid
stateDiagram-v2
  [*] --> DRAFT: createQuiz
  DRAFT --> DRAFT: add questions, set subject + target groups
  DRAFT --> OPEN: setQuizStatus (requires subject + >=1 group + >=1 question)
  OPEN --> CLOSED: setQuizStatus
  CLOSED --> OPEN: setQuizStatus
  OPEN --> [*]: deleteQuiz (cascades ALL attempts)

  state "Per student (one attempt ever)" as A {
    [*] --> IN_PROGRESS: startQuiz
    IN_PROGRESS --> COMPLETED: submitQuizAttempt
    IN_PROGRESS --> FAILED: 3rd tab switch (score 0)
    COMPLETED --> [*]
    FAILED --> [*]
  }
```

## 8. HootArena lifecycle
See `HOOTARENA_ARCHITECTURE.md` for the state diagram and the full event table.
`LOBBY → QUESTION → REVEAL → LEADERBOARD → (QUESTION | FINISHED)`, with a 20 s server-authoritative clock,
editing allowed only in LOBBY, and `host:end` able to jump to FINISHED from any live phase.

## 9. Real-time communication flow (HootArena answer round)

```mermaid
sequenceDiagram
  participant P as Player
  participant H as Host
  participant S as server.ts (/hootarena)
  participant DB as PostgreSQL

  H->>S: host:next
  S->>S: startHootQuestion - set state, 20s setTimeout
  S->>DB: HootGame.status=QUESTION, currentQuestionIndex
  S-->>P: phase:question {startedAt, timeLimitSec, options}
  S-->>H: phase:question
  Note over P: client computes countdown from startedAt (never decrements)

  P->>S: player:answer {gameId, questionId, selectedOptionIds}
  S->>S: gameId match? phase? current question? already answered? within 20s+500ms?
  S->>DB: load question + options
  S->>S: isSelectionCorrect (exact set) -> computeHootPoints (speed-scaled)
  S->>S: answeredPlayerIds.add BEFORE await
  S->>DB: transaction: create HootResponse + increment HootPlayer.score
  S-->>P: answer:you {isCorrect, pointsAwarded}
  S-->>H: answer:count {answered, total}

  Note over S: 20s timer fires OR host clicks Reveal
  S->>S: revealHootQuestion - flip status SYNCHRONOUSLY before first await
  S->>DB: count responses per option
  S-->>P: phase:reveal (slim: answeredCount/totalPlayers ONLY)
  S-->>H: phase:reveal:host (full per-option distribution + correct answer)

  H->>S: host:next
  S->>DB: read scores
  S-->>H: leaderboard:host (full ranked board)
  S-->>P: leaderboard:you (own score + top 3 only)
```

## How the systems connect — and where they don't

**Shared:** `User` (admins host Hoot games and own quizzes; students take quizzes and file reports) ·
`Program → Subject → Group` (quizzes and student enrolment; **not** HootArena) · `Homework/Question/Option`
(**all three legacy+quiz modes**, which is why the legacy IDOR reaches SkillArena quiz questions) ·
the `__session` cookie (five sub-sessions in one envelope) · one Node process, one Prisma client.

**Deliberately separate:** HootArena's six tables, namespace, room space, state map, scoring module and
socket contract · legacy `Student`/`Answer` vs SkillArena `QuizAttempt`/`AttemptAnswer` ·
`IncoSubmission` (connected to nothing, by design).

**The one-line summary of the architecture:** four quiz systems and two support features, sharing identity
and organisation but not play mechanics, in a single-instance Node process where all authority over
scoring, timing and eligibility lives on the server.

## Quick "where do I look?" index

| Question | File |
|---|---|
| How is a session read/written? | `src/lib/session-core.ts`, `session-envelope.ts` |
| Is this user allowed here? | `src/proxy.ts` → the route's `layout.tsx` → the page → the action's `requireX` |
| Can this student see this quiz? | `src/lib/subjects.ts` (`eligibleHomeworkWhere`, `isStudentEligibleForQuiz`) |
| How is a quiz scored? | `src/app/quiz/[id]/actions.ts:103` (`submitQuizAttempt`) |
| How is the question timer enforced? | `src/lib/quiz.ts:48` + the deadline re-read in `selectAnswer` |
| How does anti-cheat work? | `src/components/TabSwitchMonitor.tsx` → `reportTabSwitch` |
| How are ArenaPoints computed? | `src/lib/quiz.ts:94` (`getCumulativeLeaderboard`) |
| How does a live game work? | `server.ts` (legacy from :393, HootArena from :552) |
| What does a socket event carry? | `src/lib/socket-events.ts`, `src/lib/hootarena/socket-events.ts` |
| Which admin can touch what? | the `requireX` helper at the top of each `actions.ts` |
| Where are the design tokens? | `src/app/globals.css` (`:root` and `:root[data-theme="light"]`) |
| What are the quiz rules? | `src/lib/quiz-constants.ts` (but note `QUIZ_QUESTION_POINTS` is unused) |
| What's broken? | `KNOWN_ISSUES_AND_TECHNICAL_DEBT.md`, `SECURITY_AUDIT.md` |
