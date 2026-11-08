-- @local-idempotent (scripts/local-dev.ps1 -Action applylocal may run this directly)
-- Student profile fields (hobby, communication skill, motivation) and the
-- admin-only student activity log (notes + image attachments).
--
-- Written to be idempotent (IF NOT EXISTS everywhere) so it can also be
-- applied directly to a local development database that was created
-- without migration history (see scripts/local-dev.ps1), where running it
-- twice must be harmless.

DO $$ BEGIN
  CREATE TYPE "StudentNoteKind" AS ENUM ('COMMENT', 'PROGRESS', 'ISSUE', 'MOTIVATION');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "hobby" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "communicationSkill" DOUBLE PRECISION;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "motivation" INTEGER;

CREATE TABLE IF NOT EXISTS "student_notes" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "kind" "StudentNoteKind" NOT NULL,
    "body" TEXT NOT NULL,
    "motivationFrom" INTEGER,
    "motivationTo" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "student_note_attachments" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_note_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "student_notes_studentId_createdAt_idx" ON "student_notes"("studentId", "createdAt");
CREATE INDEX IF NOT EXISTS "student_note_attachments_noteId_idx" ON "student_note_attachments"("noteId");

DO $$ BEGIN
  ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "student_note_attachments" ADD CONSTRAINT "student_note_attachments_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "student_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
