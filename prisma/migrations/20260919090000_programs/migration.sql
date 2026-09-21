-- CreateTable
CREATE TABLE "programs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "programs_name_key" ON "programs"("name");

-- Seed the two initial programs with fixed, well-known ids so the rest of
-- this migration can reference them directly without generating a cuid in
-- raw SQL (cuid() is a Prisma Client-side default, not a DB default).
INSERT INTO "programs" ("id", "name", "order") VALUES
  ('program_frontend_dev', 'Front-end Development', 0),
  ('program_networks', 'Networks', 1);

-- AlterTable: subjects gets a mandatory programId. Added nullable first so
-- existing rows can be backfilled, then made NOT NULL - the standard safe
-- pattern for adding a required column to a table that already has rows.
ALTER TABLE "subjects" ADD COLUMN "programId" TEXT;

-- Every existing subject predates the multi-program system and was always
-- Front-end Development's curriculum.
UPDATE "subjects" SET "programId" = 'program_frontend_dev' WHERE "programId" IS NULL;

ALTER TABLE "subjects" ALTER COLUMN "programId" SET NOT NULL;

-- Subject names are now unique per-program, not globally - two different
-- programs may legitimately each have their own "English".
DROP INDEX "subjects_name_key";
CREATE UNIQUE INDEX "subjects_programId_name_key" ON "subjects"("programId", "name");
CREATE INDEX "subjects_programId_idx" ON "subjects"("programId");

ALTER TABLE "subjects" ADD CONSTRAINT "subjects_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: users gets an optional programId (null only for SUPER_ADMIN,
-- who is not scoped to one program).
ALTER TABLE "users" ADD COLUMN "programId" TEXT;
CREATE INDEX "users_programId_idx" ON "users"("programId");
ALTER TABLE "users" ADD CONSTRAINT "users_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: any existing non-SUPER_ADMIN user is assigned to Front-end
-- Development so the CHECK constraint below can be added safely. In
-- practice this is only the e2e test admin at migration time - no real
-- students exist yet (see the test-data cleanup that preceded this).
UPDATE "users" SET "programId" = 'program_frontend_dev' WHERE "role" != 'SUPER_ADMIN' AND "programId" IS NULL;

-- Hard DB-level guarantee that program assignment is mandatory for every
-- role except SUPER_ADMIN, on top of the application never offering a way
-- to leave it unset - the same "hard invariant, not just app logic" pattern
-- already used for the single-Super-Admin partial unique index below.
ALTER TABLE "users" ADD CONSTRAINT "users_program_required_check" CHECK (
  ("role" = 'SUPER_ADMIN' AND "programId" IS NULL) OR
  ("role" != 'SUPER_ADMIN' AND "programId" IS NOT NULL)
);

-- Fixed groups are now exactly I/II/III per subject (previously I-IV) -
-- drop the now-unsupported 4th group from every existing subject. Safe: no
-- student/quiz data references it (verified before this migration; all
-- pre-existing test data was removed first).
DELETE FROM "groups" WHERE "name" = 'Group IV';

-- Seed Networks' three initial subjects, each with the three fixed groups.
INSERT INTO "subjects" ("id", "programId", "name", "order") VALUES
  ('subject_net_sysadmin', 'program_networks', 'კომპიუტერული ქსელები და სისტემები', 0),
  ('subject_net_hardware', 'program_networks', 'კომპიუტერის და პერიფერიული მოწყობილობების უზრუნველყოფა', 1),
  ('subject_net_english', 'program_networks', 'ინგლისური', 2);

INSERT INTO "groups" ("id", "subjectId", "name", "order") VALUES
  ('group_net_sysadmin_1', 'subject_net_sysadmin', 'Group I', 0),
  ('group_net_sysadmin_2', 'subject_net_sysadmin', 'Group II', 1),
  ('group_net_sysadmin_3', 'subject_net_sysadmin', 'Group III', 2),
  ('group_net_hardware_1', 'subject_net_hardware', 'Group I', 0),
  ('group_net_hardware_2', 'subject_net_hardware', 'Group II', 1),
  ('group_net_hardware_3', 'subject_net_hardware', 'Group III', 2),
  ('group_net_english_1', 'subject_net_english', 'Group I', 0),
  ('group_net_english_2', 'subject_net_english', 'Group II', 1),
  ('group_net_english_3', 'subject_net_english', 'Group III', 2);
