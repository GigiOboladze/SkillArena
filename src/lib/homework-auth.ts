import "server-only";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/session";
import { getCreatorTokenForHomework } from "@/lib/creator-session";

/**
 * True if the current request is either the logged-in admin, or holds the
 * matching creator-token cookie for this specific homework. This is the one
 * check every homework-management page/action gates on - admin can manage
 * every homework ever created; a no-registration creator can only manage
 * the ones their own browser made.
 */
export async function canManageHomework(homeworkId: string): Promise<boolean> {
  const homework = await prisma.homework.findUnique({
    where: { id: homeworkId },
    select: { creatorToken: true, mode: true },
  });
  // SkillArena quizzes share the Homework table but are NEVER managed through
  // these legacy LIVE/ASYNC screens: those only ask "is any admin logged in",
  // which would let a regular Admin edit or delete another program's quiz and
  // bypass requireQuizAccess's program scoping. Quizzes are managed only under
  // /admin/quizzes.
  if (!homework || homework.mode === "QUIZ") return false;

  const admin = await getAdminSession();
  if (admin) return true;

  const token = await getCreatorTokenForHomework(homeworkId);
  return !!token && homework.creatorToken === token;
}
