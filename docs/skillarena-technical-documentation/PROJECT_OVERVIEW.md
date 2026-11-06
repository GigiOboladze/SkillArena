# SkillArena — Project Overview

**Investigated:** 2026-11-05 · **Commit:** `0f1d23d` ("Rework HootArena to anonymous PIN/QR join, drop program targeting", 2026-10-07) · **Branch:** `main`, clean except untracked docs.

Everything here is derived from reading the source. Unverifiable claims are marked UNVERIFIED.

## What SkillArena actually is

A **college quiz portal for one real customer**: a college running two independent educational programs
(Front-end Development, 4 groups; Networks, 3 groups), with roughly 350 students and 8–9 staff accounts.

It is not one application but **four quiz systems sharing one codebase, one database and one Node process**.
This is the single most important fact about the project, and the source of most of its complexity:

| System | `Homework.mode` | Accounts? | Scoring | Where it lives |
|---|---|---|---|---|
| **SkillArena QUIZ** | `QUIZ` | Yes — `User` role STUDENT | 1 pt/question, no speed bonus | `src/app/quiz/**`, `src/app/dashboard/**` |
| **HootArena** | *(own tables)* | **No** — nickname + PIN | Kahoot speed-scaled, 1000 base | `src/app/hootarena/**`, `server.ts` `/hootarena` ns |
| **Legacy LIVE** | `LIVE` | No — join by name | Kahoot speed-scaled, per-question pts | `src/app/play/**`, `server.ts` default ns |
| **Legacy ASYNC** | `ASYNC` | No — join by name | Full per-question points | `src/app/play/**` (server-rendered) |

Plus two non-quiz features: **INCO** (anonymous student↔Super-Admin messaging) and **Bug Reports**
(student-filed, with DB-stored screenshots).

### The history that explains the code
It began as **"Rahoot"**, a red/white Kahoot clone with no accounts at all (legacy LIVE/ASYNC). It was then
extended into **SkillArena** — real accounts, programs, subjects, groups, anti-cheat, a cumulative
leaderboard — *without removing the old system*. Then **HootArena** was added (2026-10-06/07) as a
deliberately separate live-game engine, initially account-based with program targeting, and reworked one day
later to anonymous PIN/QR join.

The user-facing name is **SkillArena**; `package.json` is still `name: "rahoot"`, and CSS tokens are still
called `--rahoot-red` (now violet). That naming debt is cosmetic and intentional.

## What a student can do
Log in with instructor-issued credentials (there is **no public sign-up**) → see quizzes targeted at their
group for each subject they're assigned to → take each quiz **once**, 100 s per question, max 2 tab switches
→ see their score, cumulative points and rank → file bug reports → send anonymous INCO messages and check
for a reply with a reference code. Separately, with no account at all, anyone can join a HootArena game by
PIN/QR or a legacy homework by join code.

## What an admin can do
Create/publish quizzes scoped to one subject and its target groups, manage students in **their own program
only**, host HootArena games they created, view results and leaderboards, triage bug reports.

## What the Super Admin can do
Everything an Admin can, across **all programs**, plus: create/delete Admin accounts (max 8 total), create
programs and subjects, and read/answer INCO submissions. Exactly one Super Admin can ever exist, enforced by
a partial unique index in the database, and the role is never assignable through any UI.

## Current state, honestly

**Working and genuinely solid:** the authentication/session model (one signed cookie, DB-checked
`sessionVersion` revocation), program isolation across almost every admin surface, server-authoritative
quiz scoring and deadlines, the anti-cheat design, HootArena's reconnect/race handling, and INCO's
anonymity (there is deliberately **no** column linking a submission to a student).

**Verified this session:** `tsc --noEmit` passes, `next build` passes (61 route entries), HootArena scoring unit
tests pass 18/18. `npx eslint` **fails** with 8 errors. The other 11 e2e suites could not be run — they need
a running server and database, and the local dev DB is not up (see `TESTING_AND_QUALITY_AUDIT.md`).

**Genuinely broken / risky:** 20 confirmed findings, the most serious being a family of **IDOR bugs in 6
server actions** where a child id (`questionId`, `answerId`) is never checked against its validated parent —
three of which need **no account at all**. See `SECURITY_AUDIT.md` and
`KNOWN_ISSUES_AND_TECHNICAL_DEBT.md`.

**Hard operational constraint:** both live-game engines and the rate limiter keep state in process memory,
so the app **must run as a single instance**. Horizontal scaling would silently break live games.

## Relationship to the existing root-level docs
`PROJECT_MAP.md`, `BUSINESS_LOGIC.md`, `DATA_MODEL.md`, `USER_FLOWS.md`, `CURRENT_STATE.md`,
`TESTING_AND_DEPLOYMENT.md` (all untracked, written 2026-10-14 at this same commit) are **accurate**, not
stale — I verified their 10 findings and all 10 hold. But that audit states plainly that it did not read
every admin page body, the legacy pages, most components, the HootArena clients, or the e2e bodies. This
investigation read those, which is where the 10 *additional* findings come from. The two sets do not
conflict.

## Document index
| File | Contents |
|---|---|
| `TECH_STACK.md` | Verified versions, every dependency, why each exists |
| `PROJECT_STRUCTURE.md` | Full file inventory with purpose + dependencies |
| `ARCHITECTURE.md` | Request lifecycle, process model, diagrams |
| `DATABASE_SCHEMA.md` | All 22 models, constraints, cascades, migrations |
| `AUTHENTICATION_AND_PERMISSIONS.md` | Session model + full role/permission matrix |
| `FEATURES_AND_BUSINESS_LOGIC.md` | Every feature's exact rules |
| `REACT_IMPLEMENTATION_GUIDE.md` | Real React examples, for the practical exam |
| `API_AND_BACKEND_MAP.md` | Every route, action and socket event |
| `HOOTARENA_ARCHITECTURE.md` | The real-time engine in depth |
| `DESIGN_SYSTEM.md` | Tokens, components, theming, responsive |
| `TESTING_AND_QUALITY_AUDIT.md` | What tests cover, what ran, what didn't |
| `SECURITY_AUDIT.md` | Findings with exploit paths and severity |
| `KNOWN_ISSUES_AND_TECHNICAL_DEBT.md` | All 20 findings + dead code |
| `FUTURE_DEVELOPMENT_GUIDE.md` | Per-feature plans for the ideathon roadmap |
| `COMPLETE_APPLICATION_MAP.md` | Route/model/workflow map + all diagrams |
| `INVESTIGATION_PROGRESS.md` | Raw findings log from this investigation |
