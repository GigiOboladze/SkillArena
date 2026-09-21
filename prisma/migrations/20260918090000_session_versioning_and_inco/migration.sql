-- AlterTable
ALTER TABLE "users" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateEnum
CREATE TYPE "IncoCategory" AS ENUM ('PERSONAL', 'ACADEMIC', 'COMPLAINT', 'SUGGESTION', 'PROGRAM', 'LECTURER', 'ADMINISTRATION', 'STUDENT', 'OTHER');

-- CreateEnum
CREATE TYPE "IncoStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED');

-- CreateTable
CREATE TABLE "inco_submissions" (
    "id" TEXT NOT NULL,
    "category" "IncoCategory" NOT NULL,
    "message" TEXT NOT NULL,
    "status" "IncoStatus" NOT NULL DEFAULT 'NEW',
    "response" TEXT,
    "codeHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "inco_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inco_submissions_codeHash_key" ON "inco_submissions"("codeHash");

-- CreateIndex
CREATE INDEX "inco_submissions_status_idx" ON "inco_submissions"("status");
