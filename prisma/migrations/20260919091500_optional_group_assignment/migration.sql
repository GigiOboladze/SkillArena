-- Allow a subject assignment to exist without a group yet - the row still
-- represents "this student is assigned to this subject", just with no group
-- decided, so quiz eligibility (which additionally requires a group match)
-- correctly denies access without the student losing the subject assignment
-- itself. No existing row is affected (all currently have a real groupId).
ALTER TABLE "student_subject_groups" ALTER COLUMN "groupId" DROP NOT NULL;

ALTER TABLE "student_subject_groups" DROP CONSTRAINT "student_subject_groups_groupId_fkey";
ALTER TABLE "student_subject_groups" ADD CONSTRAINT "student_subject_groups_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
