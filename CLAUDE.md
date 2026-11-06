@AGENTS.md

# SkillArena — project instructions

> Full audit docs: PROJECT_MAP.md, BUSINESS_LOGIC.md, DATA_MODEL.md, USER_FLOWS.md,
> CURRENT_STATE.md, TESTING_AND_DEPLOYMENT.md (written 2026-10-14, commit `0f1d23d`).
> Read those before large changes. This file is the quick-reference summary.

## What this is

A college quiz portal. Started as "Rahoot" (Kahoot clone, anonymous, no accounts) and
was extended into **SkillArena**: authenticated students/admins, two educational
programs, subject/group-targeted quizzes, anti-cheat, cumulative leaderboards. The
legacy anonymous system (`LIVE`/`ASYNC` homework modes) was **not removed** — it still
runs alongside SkillArena's `QUIZ` mode. A fourth system, **HootArena** (anonymous
PIN/QR live multiplayer), was added most recently (Oct 2026) and is fully separate
from all three.

Browser title is "SkillArena"; `package.json` name is still `rahoot` (cosmetic debt,
leave it unless asked to rename).

## Stack

Next.js 16.3.4 (App Router) + custom Node server (`server.ts`, not `next start` —
required for Socket.IO) + Prisma 6 → PostgreSQL + Tailwind v4 (CSS-first, no
`tailwind.config.js` — tokens live in `src/app/globals.css`) + hand-rolled JWT
sessions via `jose` (no NextAuth). `src/generated/prisma` is the generated Prisma
client — gitignored, ~34k LOC, never hand-edit it, skip it when reading the codebase.

## Hard constraints — do not violate these

1. **Single instance only.** Both live-game engines (`server.ts`'s `liveStates` and
   `hootStates` Maps) and the rate limiter (`src/lib/rate-limit.ts`) keep state in
   process memory. Never suggest horizontal scaling/replicas as a fix for anything.
2. **One cookie, `__session`.** Forced by Firebase Hosting stripping all other cookie
   names on Cloud Run (historical constraint, documented in `session-core.ts`). All
   sub-sessions (admin, studentUser, legacy students/creators, hootPlayers) live in one
   signed JSON envelope. Don't add a second cookie for a new sub-session — extend the
   envelope type in `session-core.ts` instead.
3. **Server-side authority on everything score/time/eligibility-related.** Tab-switch
   count, quiz deadlines, scoring, and quiz/program eligibility are all decided
   server-side and re-verified at every layer (middleware → layout → action). Never
   trust a client-supplied value for these. Follow the existing `requireX` guard
   pattern (e.g. `requireAdminForStudent`, `requireQuizAccess`) for new admin actions.
4. **Program scoping is per-resource, not list-filtering.** A regular Admin is scoped
   to exactly one program (`admin.programId`), enforced by a DB `CHECK` constraint.
   Every mutation must re-verify program ownership itself — do not rely on a list page
   having already filtered by program. (`src/app/admin/(dashboard)/students/[id]/attempts/[attemptId]/page.tsx`
   currently fails to do this — see CURRENT_STATE.md finding #1 — don't copy that
   pattern.)
5. **Hand-written SQL constraints exist outside the Prisma schema.** The single-Super-
   Admin partial unique index and the `users_program_required_check` CHECK live only in
   migration SQL (`prisma/migrations/20260916120100_promote_super_admin`,
   `20260919090000_programs`), not in `schema.prisma`'s declarative syntax. Never
   assume `schema.prisma` alone is the full set of invariants.

## Known-contradicted historical claims — do not re-introduce

- **Groups are NOT "I, II, III only."** Front-end Development has 4 groups (I–IV);
  Networks has 3 (I–III). `Program.groupCount` is per-program. Group IV was removed
  2026-09-19, then deliberately restored 2026-09-21 — restoring it was correct.
- **HootArena has NO program/subject/group targeting.** It was explicitly removed in
  the most recent commit (`0f1d23d`). HootArena access is PIN-based only.

## Fixed quiz rules — not admin-configurable (`src/lib/quiz-constants.ts`)

1 point/question, 100s/question (deadline fixed at first view, never resets on
refresh), 3rd tab-switch auto-fails (score 0). Don't make these admin-editable without
an explicit product decision — they're deliberately hardcoded.

## Before making changes

- Run `npx tsc --noEmit` and `npm run build` — both currently pass (verified
  2026-10-14). Keep them passing.
- `npm run lint` currently **fails** (8 errors — see CURRENT_STATE.md). Pre-existing,
  not caused by your change, but don't add new lint errors on top of it; fix errors in
  files you touch where practical.
- The 12 e2e suites in `e2e/` need a running seeded Postgres + the app running — see
  TESTING_AND_DEPLOYMENT.md for the exact setup. Their current pass rate is
  **unverified** as of 2026-10-14 (no local DB was available during that audit) —
  re-run them before trusting "all green."
- There are **no error/not-found/loading boundaries anywhere** in `src/app`, and no
  `try/catch` in admin/dashboard server actions. If you add a new Restrict/cascade FK
  relation or any fallible admin action, add explicit error handling for it — don't
  assume Next's default error page is acceptable UX.

## Known open issues (see CURRENT_STATE.md for full detail)

Ranked high→low: no rate limiting on login (student or admin); plaintext temp
passwords passed via URL query string; the attempts-detail page missing its program
check; password change requires no current password (intentional, flagged); public
unauthenticated `createHomework` with no throttle; per-question timers all start on
render rather than on first answer (skimming ahead burns every clock); no error
boundaries; dead `WINDOW_BLUR` enum value never written.
