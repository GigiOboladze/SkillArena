# Future Development Guide

Analysis only — **nothing in this document was implemented.** For each candidate feature: what it can
reuse, what the database would need, what to extend, the security considerations, and the real risks.

## Read this first: how to add anything safely

The codebase has a consistent, good shape. Follow it and new features inherit the existing guarantees.

1. **Copy the guard pattern.** Every admin mutation starts with `requireAdmin()` and then a
   `requireXAccess(admin, id)` that re-checks program/ownership. Name yours the same way.
2. **The guard must cover *every* id the action touches.** This is the one rule the codebase actually
   breaks (6 actions), and it is the source of its worst bugs. If your action takes `(parentId, childId)`,
   load the child **with the parent in the `where` clause**:
   ```ts
   const child = await prisma.x.findFirst({ where: { id: childId, parentId } });
   if (!child) notFound();
   ```
3. **Never trust a client-supplied program id.** Use `resolveAdminProgramScope`, which ignores the query
   param for non-Super-Admins.
4. **Enforce invariants in the database, not just in code.** The project's own best work is
   `@@unique([studentId, homeworkId])`, `@@unique([playerId, questionId])`, the single-Super-Admin partial
   index and the program CHECK constraint.
5. **`redirect()` throws — never put it inside a `try`.** Two commits exist solely to fix that mistake.
6. **Extend the session envelope, don't add a cookie.** Add a field to `SessionEnvelope` in
   `session-core.ts` and cap any new map.
7. **Keep `server-only` on new lib files** unless `server.ts` must import them — and if it must, write a
   comment saying why, as `session-core.ts` and `hootarena/access.ts` do.
8. **Add a token to both theme blocks**, never a hardcoded hex.
9. **Single instance.** Never introduce anything that assumes shared memory across processes, and never
   "solve" load with replicas.
10. **Write the negative test.** Every finding in this audit would have been caught by one test that calls
    an action the way the UI never would.

### Do these before any new feature
They are tiny, carry essentially no behavioural risk, and three of them protect data a new feature would
otherwise put more of at stake:
- the 4 one-line `where`-clause IDOR fixes (S1, S2)
- the legacy host `homeworkId` check (S3)
- the attempt-page program guard (S4)
- `error.tsx` / `not-found.tsx` / `loading.tsx` (R1) — you will want these the moment you add a page that
  can fail

---

## 1. Student profiles with avatars

**Reuses:** `/dashboard/profile` and `/admin/students/[id]` already exist with the right layout; the
bug-report attachment pipeline is a **complete, proven precedent** for user-uploaded images —
`sniffImageContentType` magic-byte validation, DB-stored `Bytes`, and `/attachments/[id]` as an
auth-gated serving route with uniform 404s.

**Schema:** cheapest correct option is a new `UserAvatar` model (`userId @unique`, `contentType`,
`fileSize`, `data Bytes`, `updatedAt`) rather than a column on `User` — `User` is loaded on **every
authenticated request** by `getCurrent*`, and adding a `Bytes` column there would drag image bytes into
every session check. A separate table keeps `User` cheap.

**Extend:** a `GET /avatars/[userId]` route modelled on `attachments/[id]`; an upload action modelled on
`submitBugReport`; render in `dashboard/layout.tsx`, the profile page, `CumulativeLeaderboard` and
`admin/students/page.tsx`.

**Security:** reuse magic-byte sniffing (never trust `File.type`); cap dimensions as well as bytes —
`next.config.ts` already allows an 8 MB action body, so set a tighter per-avatar cap (~500 KB); decide
visibility deliberately — the leaderboard already shows classmates' real names, so avatars there are
consistent with existing exposure, but make it a decision, not an accident.

**Risks:** DB size growth (350 avatars × 500 KB ≈ 175 MB in Postgres — acceptable, but note the project
chose DB-backed bytes specifically because the filesystem is ephemeral, so this is the intended trade);
avatars are a new moderation surface in a student-facing product.
**Effort: S–M.**

---

## 2. Admin-only student progress updates + date-based development history

This is the most natural fit for the existing architecture, and the strongest demo material.

**Reuses:** `QuizAttempt` already *is* a dated history (`startedAt`, `completedAt`, `score`);
`/admin/students/[id]` already renders a chronological list; `requireAdminForStudent` already gives
correct program-scoped authorization.

**Schema:** a new append-only model, e.g.
```
StudentProgressNote
  id · studentId → User (Cascade) · authorId → User (Restrict) · programId → Program
  note String · category? · occurredAt DateTime · createdAt
  @@index([studentId, occurredAt])
```
Key design calls: **append-only** (edits as new rows) so it is a real audit trail; store `programId` at
write time so a later program change does not silently re-attribute history — this mirrors the existing
documented policy for `QuizAttempt` in `getCumulativeLeaderboard`; `authorId` must be `Restrict`, not
`Cascade`, or deleting an admin would erase their notes.

**Extend:** a section on `/admin/students/[id]`; a read-only timeline on `/dashboard/profile` **if** notes
are student-visible.

**Security — the important decision:** are notes visible to the student? If yes, admins must know that
when writing. If no, you have created staff-only records about students, which has data-protection
implications and makes the missing audit log (see below) a real gap. **Decide and label it in the UI
either way.** Authorization itself is solved: `requireAdminForStudent` is the correct guard.

**Risks:** low technically. The genuine risk is product/ethical, not code.
**Effort: M.** This also pairs naturally with adding the **audit log** the system currently lacks — the
same table shape could record destructive admin actions.

---

## 3. Motivation and engagement indicators

**Reuses:** everything needed already exists in `QuizAttempt` — timestamps, scores, status, tab-switch
counts. `getCumulativeLeaderboard` is the model for live computation.

**Schema:** ideally **none**. Streaks, participation rate and trend are all derivable from existing rows.
Resist adding denormalised counters: the project's stated principle is "no cached/stale totals"
(`lib/scoring.ts:38`), and every reported inconsistency in similar systems comes from a counter drifting
from its source.

**Risks:** this is where **R3** bites. `getCumulativeLeaderboard` already fetches every student in a
program with all their attempts and reduces in JS, and it is called on four surfaces. Adding more
derived metrics to the same page multiplies that. If you add this, move the aggregation into SQL
(`groupBy`) first — that is the one performance change worth making pre-emptively.

Also: don't surface `tabSwitchCount` as an "engagement" metric. It is an anti-cheat signal with known
false positives (R10); presenting it as motivation data would misrepresent it.
**Effort: S for the computation, M if you fix the aggregation properly.**

---

## 4. Personalised learning goals

**Reuses:** `StudentSubjectGroup` is the precedent for a per-(student, subject) row with a nullable field;
`Subject`/`Group` show how to make configuration data rows rather than enums.

**Schema:** `LearningGoal` (`studentId`, `subjectId?`, `description`, `targetScore?`, `dueAt?`, `status`,
`createdById`). Add `@@unique([studentId, subjectId])` if one active goal per subject is the rule — decide
the invariant before writing the model, and encode it.

**Security:** who creates goals — admin, student, or both? That single answer changes the whole
authorization shape. If students self-serve, the action must derive `studentId` from the session and never
from the form, exactly as `submitBugReport` does.

**Risks:** scope creep into a full LMS. Progress toward a goal must be *derived* from attempts, not
manually maintained, or it will drift.
**Effort: M.**

---

## 5. SkillPet / gamification

**Reuses:** the two-accent design system already separates achievement (orange `--skillarena-accent`,
medals) from actions (violet) — gamification has a visual home already. `CountUp` and `.tile-pop` are
existing restrained-motion primitives.

**Schema:** `SkillPet` (`studentId @unique`, `stage`, `xp`, `updatedAt`) — and be careful here: **XP must be
derivable or reconcilable from `QuizAttempt`**, otherwise a bug or a replay double-counts permanently and
there is no recovery path. Safest design: store only cosmetic state and compute XP live from attempts;
persist XP only if you also write a reconciliation job.

**Risks — the highest of any item here:**
- This is the only proposed feature that introduces **mutable derived state**, cutting against the
  codebase's "compute live" principle. Treat that deliberately.
- Anything real-time (pet reacting during a quiz) collides with the single-instance in-memory model and
  with the anti-cheat design — do not add animations that could be mistaken for a tab change, and do not
  put pet state in `liveStates`.
- Fairness: a FAILED attempt scores 0 and still counts as "taken"; decide how that interacts with XP
  before students notice the edge case.
- It is also the feature most likely to be *demoed* and least likely to be *finished*. For an ideathon,
  a convincing read-only pet driven by live-computed XP beats a half-built economy.

**Effort: M–L.**

---

## 6. Additional learning analytics

**Reuses:** `AttemptAnswer` holds per-question correctness for every attempt, which is already enough for
genuinely useful analytics: hardest question per quiz, per-group comparison, per-subject trend over time.
`HootResponse` holds the same for live games. `buildHootRevealPayload` is a working precedent for
per-option distribution maths.

**Schema:** none required. This is the **highest-value, lowest-risk** item on the list — the data is
already collected and currently under-used. Note HootArena in particular stores every response and has
**no history UI at all**, so that data is collected and never shown.

**Extend:** a new section on `/admin/quizzes/[id]/results`, or a new `/admin/analytics` page using
`resolveAdminProgramScope` + `ProgramSelector` like every other admin surface.

**Security:** aggregate views must respect program scoping — build the `where` from
`resolveAdminProgramScope`, never from a raw query param. If you add any student-facing comparison, do not
expose other students' per-question answers; the HootArena payload split is the model for how to separate
host and student views.

**Risks:** query cost (see R3) and small-cohort privacy — a "Group III average" over 4 students is close
to naming them.
**Effort: S–M. Strongest ideathon demo per unit of work.**

---

## 7. New React-based pages

Nothing structural is needed; follow the existing patterns.

- Server Component + direct Prisma + `Promise.all` (see `dashboard/page.tsx`).
- `"use client"` only for a genuine island; pass server-computed values as props
  (`QuestionClientControls` is the reference).
- Uncontrolled forms + `FormData` + `.bind` for ids; `useActionState` only when you must render returned
  state.
- Reuse `.card` / `.btn` / `.input` / `.badge` and the `max-w-5xl` + `px-6` shell.
- Add the route to `proxy.ts`'s matcher **and** re-check the session in the layout — the middleware is not
  sufficient on its own, and it does no `sessionVersion` check.

---

## 8. Improved administrative workflows

Concrete, valuable, and mostly small:
- **An audit log** — the most significant missing control (S12). Admins hold grade-affecting power over
  350 students with no record of who did what. Shares a table shape with item 2.
- **Bulk student import (CSV)** — reuse `parseSubjectGroupAssignments`; the real work is error reporting
  on partial failure, and it must be transactional per row.
- **A password-handover flow that doesn't use URLs** (fixes S6) — a short-lived server-side flash or a
  one-time reveal page.
- **Quiz duplication** — high-value for "same quiz, next cohort"; straightforward given `QuizTargetGroup`
  is replaceable wholesale. Make sure the copy starts as `DRAFT` with no attempts.
- **HootArena history UI** — the data already exists (see item 6).
- **Soft delete / archive for Subject and Program** — the schema comments explicitly nominate this as the
  correct future approach instead of wiring up cascade deletes.

---

## Cross-cutting items worth doing regardless

| Item | Why | Effort |
|---|---|---|
| `error.tsx`, `not-found.tsx`, `loading.tsx` | Zero exist today; every failure shows Next's unstyled page | S |
| Move leaderboard aggregation into SQL | Unblocks items 3 and 6 at scale (R3) | S–M |
| Lint in CI (no `.github/` exists) | 8 errors are already committed | S |
| Negative/IDOR tests | Would have caught the worst findings | S |
| Prune `liveStates`/`hootStates` on finish | Unbounded growth (R2) | S |
| Audit log | Missing control with real consequences | M |
| Security headers + `Referrer-Policy` | None set; also mitigates S6 | S |
| Bump the production `connection_limit` | Flagged as a bottleneck, still pending (R4) | S |
| Fix the 3 stale HootArena comments + the `QUIZ_QUESTION_POINTS` trap | Actively misleading to the next developer | S |

---

## Suggested roadmap for the ideathon

**Phase 0 — one sitting, before anything else.** The 4 one-line IDOR fixes, the legacy host check, the
attempt-page guard, and the three boundary files. You do not want to demo a product with an
unauthenticated destructive endpoint, and this is roughly an hour of work.

**Phase 1 — strongest demo per unit of effort.** Learning analytics (item 6) on top of data you already
collect, plus the dashboard in-progress fix (F1) because a reviewer *will* close a tab mid-quiz and notice.

**Phase 2 — the differentiator.** Admin progress notes with a date-based timeline (item 2). It is the item
that most clearly extends SkillArena from "quiz tool" into "student development platform", and it reuses
authorization that already works correctly.

**Phase 3 — the visible hook.** Avatars (item 1) and a read-only SkillPet (item 5) driven by
live-computed XP. Cosmetic, well-precedented, and safe to cut if time runs out.

**Deliberately later:** personalised goals (needs a product decision first), persisted XP economies (needs
reconciliation), anything real-time (collides with the single-instance model).

**One honest framing note for the presentation.** The strongest technical story here is not the feature
count — it is the engineering reasoning already in the codebase: database-enforced invariants rather than
app-only rules, server-authoritative scoring and timing, structural anonymity for INCO, and the documented
race handling in HootArena. That is unusual work for a student project, and it is more compelling than a
new page. Pair it with honesty about the known gaps, which is itself a signal of engineering maturity.
