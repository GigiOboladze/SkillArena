-- AlterTable: group count is per-program, not a global constant.
ALTER TABLE "programs" ADD COLUMN "groupCount" INTEGER NOT NULL DEFAULT 3;

-- Front-end Development was incorrectly reduced to 3 fixed groups in the
-- programs migration (20260919090000_programs) - it has always actually
-- needed 4 (I-IV). Networks correctly stays at 3, the default.
UPDATE "programs" SET "groupCount" = 4 WHERE "id" = 'program_frontend_dev';

-- Restore "Group IV" for every existing Front-end Development subject (the
-- same migration deleted it, on the incorrect "every program has 3 groups"
-- assumption). Safe: no student/quiz data referenced Group IV before it was
-- deleted (verified at the time - no real students existed yet), so this is
-- purely additive, not a data-loss recovery. Deterministic id (derived from
-- the subject id) rather than a generated one, since cuid() is a Prisma
-- Client-side default, not available in raw SQL. Guarded with NOT EXISTS so
-- this migration is safe to design even if some subject already has one.
INSERT INTO "groups" ("id", "subjectId", "name", "order")
SELECT 'group_' || s."id" || '_iv', s."id", 'Group IV', 3
FROM "subjects" s
WHERE s."programId" = 'program_frontend_dev'
  AND NOT EXISTS (SELECT 1 FROM "groups" g WHERE g."subjectId" = s."id" AND g."name" = 'Group IV');
