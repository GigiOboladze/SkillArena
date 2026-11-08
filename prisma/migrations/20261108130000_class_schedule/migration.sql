-- @local-idempotent (scripts/local-dev.ps1 -Action applylocal may run this directly)
-- Weekly class schedule per student (student dashboard "Class Schedule").
-- Idempotent so it can be applied directly to a local database that has no
-- migration history; running it twice is harmless.

CREATE TABLE IF NOT EXISTS "schedule_entries" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "days" INTEGER[],
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "room" TEXT,
    "tone" TEXT NOT NULL DEFAULT 'violet',
    "icon" TEXT NOT NULL DEFAULT 'book',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "schedule_entries_studentId_sortOrder_idx" ON "schedule_entries"("studentId", "sortOrder");

DO $$ BEGIN
  ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Starting schedule for the "tester tester" demo student (only if that
-- student exists and has no schedule yet - never touches anyone else).
INSERT INTO "schedule_entries" ("id", "studentId", "title", "days", "startTime", "endTime", "room", "tone", "icon", "sortOrder")
SELECT 'sched_' || md5(u."id" || v.title), u."id", v.title, v.days, v.st, v.et, v.room, v.tone, v.icon, v.ord
FROM "users" u
CROSS JOIN (VALUES
  ('HTML/CSS', ARRAY[1,2,3,4], '18:00', '21:00', 'N303 Auditory', 'violet', 'code', 0),
  ('English',  ARRAY[1,5],     '12:00', '15:00', 'Online',        'teal',   'book', 1),
  ('Git',      ARRAY[3,6],     '15:00', '18:00', 'N303 Auditory', 'amber',  'git',  2)
) AS v(title, days, st, et, room, tone, icon, ord)
WHERE u."role" = 'STUDENT'
  AND (u."username" = 'tester' OR (lower(u."firstName") = 'tester' AND lower(u."lastName") = 'tester'))
  AND NOT EXISTS (SELECT 1 FROM "schedule_entries" e WHERE e."studentId" = u."id");
