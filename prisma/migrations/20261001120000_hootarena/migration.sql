-- CreateEnum
CREATE TYPE "HootGameStatus" AS ENUM ('LOBBY', 'QUESTION', 'REVEAL', 'LEADERBOARD', 'FINISHED');

-- CreateEnum
CREATE TYPE "HootQuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE');

-- CreateTable
CREATE TABLE "hoot_games" (
    "id" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "status" "HootGameStatus" NOT NULL DEFAULT 'LOBBY',
    "currentQuestionIndex" INTEGER NOT NULL DEFAULT -1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "hoot_games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hoot_target_groups" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "hoot_target_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hoot_questions" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" "HootQuestionType" NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "hoot_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hoot_options" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,

    CONSTRAINT "hoot_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hoot_players" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "connected" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hoot_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hoot_responses" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "selectedOptionIds" TEXT[],
    "isCorrect" BOOLEAN NOT NULL,
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hoot_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hoot_games_pin_key" ON "hoot_games"("pin");

-- CreateIndex
CREATE INDEX "hoot_games_subjectId_idx" ON "hoot_games"("subjectId");

-- CreateIndex
CREATE INDEX "hoot_games_hostId_idx" ON "hoot_games"("hostId");

-- CreateIndex
CREATE INDEX "hoot_games_status_idx" ON "hoot_games"("status");

-- CreateIndex
CREATE INDEX "hoot_target_groups_groupId_idx" ON "hoot_target_groups"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "hoot_target_groups_gameId_groupId_key" ON "hoot_target_groups"("gameId", "groupId");

-- CreateIndex
CREATE INDEX "hoot_questions_gameId_idx" ON "hoot_questions"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "hoot_questions_gameId_order_key" ON "hoot_questions"("gameId", "order");

-- CreateIndex
CREATE INDEX "hoot_options_questionId_idx" ON "hoot_options"("questionId");

-- CreateIndex
CREATE INDEX "hoot_players_gameId_idx" ON "hoot_players"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "hoot_players_gameId_userId_key" ON "hoot_players"("gameId", "userId");

-- CreateIndex
CREATE INDEX "hoot_responses_questionId_idx" ON "hoot_responses"("questionId");

-- CreateIndex
CREATE INDEX "hoot_responses_gameId_idx" ON "hoot_responses"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "hoot_responses_playerId_questionId_key" ON "hoot_responses"("playerId", "questionId");

-- AddForeignKey
ALTER TABLE "hoot_games" ADD CONSTRAINT "hoot_games_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hoot_games" ADD CONSTRAINT "hoot_games_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hoot_target_groups" ADD CONSTRAINT "hoot_target_groups_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "hoot_games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hoot_target_groups" ADD CONSTRAINT "hoot_target_groups_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hoot_questions" ADD CONSTRAINT "hoot_questions_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "hoot_games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hoot_options" ADD CONSTRAINT "hoot_options_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "hoot_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hoot_players" ADD CONSTRAINT "hoot_players_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "hoot_games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hoot_players" ADD CONSTRAINT "hoot_players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hoot_responses" ADD CONSTRAINT "hoot_responses_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "hoot_games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hoot_responses" ADD CONSTRAINT "hoot_responses_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "hoot_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hoot_responses" ADD CONSTRAINT "hoot_responses_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "hoot_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

