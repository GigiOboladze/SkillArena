// Deliberately NOT "server-only": this module is imported both by Next.js
// server actions/pages AND by server.ts, which runs under plain Node (via
// tsx) outside Next's bundler - "server-only" throws unconditionally in that
// context (see session-core.ts's own comment for the identical reason it
// avoids the guard too).
import { prisma } from "@/lib/prisma";
import type { User } from "@/generated/prisma/client";

/**
 * Whether `admin` may create/manage a HootArena game under `programId` -
 * same rule as every other admin-management surface in the app (quizzes,
 * students, programs): the Super Admin may act on any program, a regular
 * Admin only on their own assigned one. Never trust a client-supplied
 * program id over this check.
 */
export function canAdminActOnProgram(admin: Pick<User, "role" | "programId">, programId: string): boolean {
  return admin.role === "SUPER_ADMIN" || admin.programId === programId;
}

/**
 * Loads a HootGame and verifies `admin` may host/manage it, mirroring
 * requireQuizAccess's ownership model exactly: any admin in the game's own
 * program may manage it (not just the one who created it) - so a colleague
 * can step in to host, or reconnect as host after the original host's
 * session drops - while the Super Admin may manage any program's games.
 * Returns null if the game doesn't exist or the admin isn't authorized;
 * callers decide whether that's a 404, a redirect, or a socket ack(false).
 */
export async function loadHootGameForAdmin(admin: Pick<User, "role" | "programId">, gameId: string) {
  const game = await prisma.hootGame.findUnique({
    where: { id: gameId },
    include: { subject: true },
  });
  if (!game) return null;
  if (!canAdminActOnProgram(admin, game.subject.programId)) return null;
  return game;
}

/**
 * Server-side membership check: is `userId` allowed to join `game`? Checks,
 * in order: the student has a program, that program matches the game's
 * subject's program, the student has a group assigned for that exact
 * subject (not just "a group somewhere"), and that group is one of the
 * game's target groups. Every step re-derives from the database - nothing
 * here is ever taken from a client-supplied payload.
 */
export async function isStudentEligibleForHootGame(
  userId: string,
  game: { id: string; subjectId: string }
): Promise<boolean> {
  const [student, subject, membership] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { programId: true, role: true } }),
    prisma.subject.findUnique({ where: { id: game.subjectId }, select: { programId: true } }),
    prisma.studentSubjectGroup.findUnique({
      where: { studentId_subjectId: { studentId: userId, subjectId: game.subjectId } },
      select: { groupId: true },
    }),
  ]);

  if (!student || student.role !== "STUDENT" || !student.programId) return false;
  if (!subject || subject.programId !== student.programId) return false;
  if (!membership?.groupId) return false;

  const targeted = await prisma.hootTargetGroup.findUnique({
    where: { gameId_groupId: { gameId: game.id, groupId: membership.groupId } },
  });
  return !!targeted;
}
