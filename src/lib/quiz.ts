import "server-only";
import { prisma } from "@/lib/prisma";
import type { QuizAttempt } from "@/generated/prisma/client";

export {
  QUIZ_QUESTION_POINTS,
  QUIZ_QUESTION_TIME_LIMIT_SEC,
  QUIZ_MAX_TAB_SWITCHES,
  QUIZ_TAB_SWITCH_FAILURE_REASON,
} from "@/lib/quiz-constants";
import { QUIZ_QUESTION_TIME_LIMIT_SEC } from "@/lib/quiz-constants";

/** Loads a QUIZ-mode homework the student is allowed to see (published) or has already attempted. */
export async function getVisibleQuiz(quizId: string) {
  return prisma.homework.findFirst({
    where: { id: quizId, mode: "QUIZ" },
    include: { questions: { orderBy: { order: "asc" }, include: { options: { orderBy: { order: "asc" } } } } },
  });
}

export async function getAttempt(studentId: string, quizId: string) {
  return prisma.quizAttempt.findUnique({
    where: { studentId_homeworkId: { studentId, homeworkId: quizId } },
  });
}

/**
 * Starts a new attempt, or returns the existing one. The unique constraint
 * on [studentId, homeworkId] is what actually guarantees "one attempt ever"
 * under concurrent requests - this just makes the common case explicit.
 */
export async function startOrGetAttempt(studentId: string, quizId: string, totalQuestions: number): Promise<QuizAttempt> {
  const existing = await getAttempt(studentId, quizId);
  if (existing) return existing;

  return prisma.quizAttempt.create({
    data: { studentId, homeworkId: quizId, totalQuestions },
  });
}

/**
 * Returns the AttemptAnswer row for this question, creating it (with a fresh
 * 100s deadline) the first time it's opened. Upsert with a no-op update
 * branch makes "create if missing, otherwise leave untouched" atomic under
 * the [attemptId, questionId] unique constraint - a refresh or revisit can
 * never push the deadline forward.
 */
export async function getOrCreateAttemptAnswer(attemptId: string, questionId: string) {
  return prisma.attemptAnswer.upsert({
    where: { attemptId_questionId: { attemptId, questionId } },
    create: {
      attemptId,
      questionId,
      deadlineAt: new Date(Date.now() + QUIZ_QUESTION_TIME_LIMIT_SEC * 1000),
    },
    update: {},
  });
}

export function remainingSeconds(deadlineAt: Date): number {
  return Math.max(0, Math.ceil((deadlineAt.getTime() - Date.now()) / 1000));
}

export type CumulativeLeaderboardEntry = {
  studentId: string;
  firstName: string;
  lastName: string;
  totalScore: number;
  completedQuizzes: number;
};

/**
 * The cumulative SkillArena leaderboard for one program: every student
 * CURRENTLY assigned to that program, with their total score summed across
 * every one of their quiz attempts that belong to THAT program's own
 * quizzes (COMPLETED or FAILED - FAILED attempts already store score 0, so
 * including them doesn't change the sum, it just means a failed attempt
 * still shows up as "1 quiz taken"). Computed live from stored attempts on
 * every call, matching this app's existing "no cached/stale totals"
 * leaderboard philosophy (see lib/scoring.ts). Ties are broken
 * alphabetically by last name, then first name.
 *
 * Program-change policy (documented here since this is the one place it's
 * enforced): a QuizAttempt is never re-labeled with the student's current
 * program - it's permanently attributed to the program of the quiz it was
 * taken under, via `homework.subject.programId`. Combined with the roster
 * being "students currently in this program", the net effect is: nothing is
 * ever deleted or duplicated, but if a student changes program, their past
 * attempts stop counting toward any leaderboard the moment either (a) they
 * are no longer listed in the old program's roster, or (b) the attempt's
 * quiz doesn't belong to the program being viewed. Their full history
 * remains intact and visible on their own student-detail/profile pages.
 */
export async function getCumulativeLeaderboard(programId: string): Promise<CumulativeLeaderboardEntry[]> {
  const students = await prisma.user.findMany({
    where: { role: "STUDENT", programId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      quizAttempts: {
        where: { status: { in: ["COMPLETED", "FAILED"] }, homework: { subject: { programId } } },
        select: { score: true },
      },
    },
  });

  const entries: CumulativeLeaderboardEntry[] = students.map((s) => ({
    studentId: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
    totalScore: s.quizAttempts.reduce((sum, a) => sum + a.score, 0),
    completedQuizzes: s.quizAttempts.length,
  }));

  entries.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    const nameA = `${a.lastName} ${a.firstName}`.toLowerCase();
    const nameB = `${b.lastName} ${b.firstName}`.toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return entries;
}
