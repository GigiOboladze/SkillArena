-- AlterTable
ALTER TABLE "homeworks" ADD COLUMN     "subjectId" TEXT;

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_subject_groups" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "student_subject_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_target_groups" (
    "id" TEXT NOT NULL,
    "homeworkId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "quiz_target_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subjects_name_key" ON "subjects"("name");

-- CreateIndex
CREATE INDEX "groups_subjectId_idx" ON "groups"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "groups_subjectId_name_key" ON "groups"("subjectId", "name");

-- CreateIndex
CREATE INDEX "student_subject_groups_subjectId_idx" ON "student_subject_groups"("subjectId");

-- CreateIndex
CREATE INDEX "student_subject_groups_groupId_idx" ON "student_subject_groups"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "student_subject_groups_studentId_subjectId_key" ON "student_subject_groups"("studentId", "subjectId");

-- CreateIndex
CREATE INDEX "quiz_target_groups_groupId_idx" ON "quiz_target_groups"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_target_groups_homeworkId_groupId_key" ON "quiz_target_groups"("homeworkId", "groupId");

-- CreateIndex
CREATE INDEX "homeworks_subjectId_idx" ON "homeworks"("subjectId");

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_subject_groups" ADD CONSTRAINT "student_subject_groups_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_subject_groups" ADD CONSTRAINT "student_subject_groups_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_subject_groups" ADD CONSTRAINT "student_subject_groups_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_target_groups" ADD CONSTRAINT "quiz_target_groups_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "homeworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_target_groups" ADD CONSTRAINT "quiz_target_groups_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homeworks" ADD CONSTRAINT "homeworks_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

