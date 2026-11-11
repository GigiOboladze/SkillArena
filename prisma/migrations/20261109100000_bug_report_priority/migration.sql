-- @local-idempotent (scripts/local-dev.ps1 -Action applylocal may run this directly)
-- Bug report priority (Low / Medium / High / Critical), set by admins.
-- Idempotent so running it twice (or on a database without migration
-- history) is harmless.

DO $$ BEGIN
  CREATE TYPE "BugReportPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "bug_reports" ADD COLUMN IF NOT EXISTS "priority" "BugReportPriority" NOT NULL DEFAULT 'MEDIUM';
