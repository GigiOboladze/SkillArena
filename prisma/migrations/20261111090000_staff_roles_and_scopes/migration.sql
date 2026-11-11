-- @local-idempotent (scripts/local-dev.ps1 -Action applylocal may run this directly)
-- Staff roles and scope assignments.
--
-- ADDITIVE ONLY. Nothing is dropped, renamed or rewritten:
--   * five new UserRole values (existing ADMIN accounts keep role ADMIN and
--     exactly their current access until the Super Admin reassigns them);
--   * users.isActive (defaults to true, so every existing account stays active);
--   * four new StudentNoteKind values and two nullable follow-up columns;
--   * inco_submissions.programId, nullable - existing messages keep NULL and
--     stay visible to the Super Admin only;
--   * six new, empty assignment tables.
-- Safe to run twice.

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'LECTURER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'JUNIOR_CAPTAIN';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MIDDLE_CAPTAIN';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SENIOR_CAPTAIN';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUCCESS_MANAGER';

ALTER TYPE "StudentNoteKind" ADD VALUE IF NOT EXISTS 'ACADEMIC';
ALTER TYPE "StudentNoteKind" ADD VALUE IF NOT EXISTS 'COMMUNICATION';
ALTER TYPE "StudentNoteKind" ADD VALUE IF NOT EXISTS 'FOLLOW_UP';
ALTER TYPE "StudentNoteKind" ADD VALUE IF NOT EXISTS 'FEEDBACK';

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "student_notes" ADD COLUMN IF NOT EXISTS "followUpAt" TIMESTAMP(3);
ALTER TABLE "student_notes" ADD COLUMN IF NOT EXISTS "followUpDoneAt" TIMESTAMP(3);

ALTER TABLE "inco_submissions" ADD COLUMN IF NOT EXISTS "programId" TEXT;
CREATE INDEX IF NOT EXISTS "inco_submissions_programId_idx" ON "inco_submissions"("programId");
DO $$ BEGIN
  ALTER TABLE "inco_submissions" ADD CONSTRAINT "inco_submissions_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "lecturer_assignments" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lecturer_assignments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "lecturer_assignments_userId_groupId_key" ON "lecturer_assignments"("userId", "groupId");
CREATE INDEX IF NOT EXISTS "lecturer_assignments_groupId_idx" ON "lecturer_assignments"("groupId");

CREATE TABLE IF NOT EXISTS "captain_students" (
  "id" TEXT NOT NULL,
  "captainId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "captain_students_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "captain_students_captainId_studentId_key" ON "captain_students"("captainId", "studentId");
CREATE INDEX IF NOT EXISTS "captain_students_studentId_idx" ON "captain_students"("studentId");

CREATE TABLE IF NOT EXISTS "cohorts" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cohorts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "cohorts_programId_name_key" ON "cohorts"("programId", "name");

CREATE TABLE IF NOT EXISTS "cohort_members" (
  "id" TEXT NOT NULL,
  "cohortId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cohort_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "cohort_members_studentId_key" ON "cohort_members"("studentId");
CREATE INDEX IF NOT EXISTS "cohort_members_cohortId_idx" ON "cohort_members"("cohortId");

CREATE TABLE IF NOT EXISTS "cohort_captains" (
  "id" TEXT NOT NULL,
  "cohortId" TEXT NOT NULL,
  "captainId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cohort_captains_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "cohort_captains_cohortId_captainId_key" ON "cohort_captains"("cohortId", "captainId");
CREATE INDEX IF NOT EXISTS "cohort_captains_captainId_idx" ON "cohort_captains"("captainId");

CREATE TABLE IF NOT EXISTS "captain_supervision" (
  "id" TEXT NOT NULL,
  "seniorId" TEXT NOT NULL,
  "captainId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "captain_supervision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "captain_supervision_seniorId_captainId_key" ON "captain_supervision"("seniorId", "captainId");
CREATE INDEX IF NOT EXISTS "captain_supervision_captainId_idx" ON "captain_supervision"("captainId");

DO $$ BEGIN
  ALTER TABLE "lecturer_assignments" ADD CONSTRAINT "lecturer_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "lecturer_assignments" ADD CONSTRAINT "lecturer_assignments_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "lecturer_assignments" ADD CONSTRAINT "lecturer_assignments_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "captain_students" ADD CONSTRAINT "captain_students_captainId_fkey" FOREIGN KEY ("captainId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "captain_students" ADD CONSTRAINT "captain_students_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "cohort_members" ADD CONSTRAINT "cohort_members_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "cohorts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "cohort_members" ADD CONSTRAINT "cohort_members_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "cohort_captains" ADD CONSTRAINT "cohort_captains_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "cohorts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "cohort_captains" ADD CONSTRAINT "cohort_captains_captainId_fkey" FOREIGN KEY ("captainId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "captain_supervision" ADD CONSTRAINT "captain_supervision_seniorId_fkey" FOREIGN KEY ("seniorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "captain_supervision" ADD CONSTRAINT "captain_supervision_captainId_fkey" FOREIGN KEY ("captainId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
