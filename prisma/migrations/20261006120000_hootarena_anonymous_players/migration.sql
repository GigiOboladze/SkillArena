-- HootArena no longer requires a SkillArena account to play: a game is
-- joinable by PIN/QR alone, with a self-chosen nickname per game instead of
-- a logged-in User, and program/group targeting is dropped entirely (access
-- control is "whoever the host shares the PIN with"). Safe to run even
-- against a database with no existing HootArena data (the common case,
-- since the original hootarena migration creates empty tables) - the
-- NOT NULL columns added to hoot_players below assume that.

-- DropForeignKey
ALTER TABLE "hoot_games" DROP CONSTRAINT "hoot_games_subjectId_fkey";

-- DropForeignKey
ALTER TABLE "hoot_target_groups" DROP CONSTRAINT "hoot_target_groups_gameId_fkey";

-- DropForeignKey
ALTER TABLE "hoot_target_groups" DROP CONSTRAINT "hoot_target_groups_groupId_fkey";

-- DropForeignKey
ALTER TABLE "hoot_players" DROP CONSTRAINT "hoot_players_userId_fkey";

-- DropIndex
DROP INDEX "hoot_games_subjectId_idx";

-- DropIndex
DROP INDEX "hoot_players_gameId_userId_key";

-- AlterTable
ALTER TABLE "hoot_games" DROP COLUMN "subjectId";

-- AlterTable
ALTER TABLE "hoot_players" DROP COLUMN "userId",
ADD COLUMN     "clientToken" TEXT NOT NULL,
ADD COLUMN     "username" TEXT NOT NULL;

-- DropTable
DROP TABLE "hoot_target_groups";

-- CreateIndex
CREATE UNIQUE INDEX "hoot_players_gameId_username_key" ON "hoot_players"("gameId", "username");
