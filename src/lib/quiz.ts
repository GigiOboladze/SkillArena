import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { QuizAttempt } from "@/generated/prisma/client";

export {
  QUIZ_QUESTION_POINTS,
  QUIZ_QUESTION_TIME_LIMIT_SEC,
  QUIZ_MAX_TAB_SWITCHES,
  QUIZ_TAB_SWITCH_FAILURE_REASON,
} from "@/lib/quiz-constants";
import { QUIZ_QUESTION_TIME_LIMIT_SEC } from "@/lib/quiz-constants";

/**
 * Loads a QUIZ-mode homework by id, with its questions and options ordered.
 *
 * Deliberately does NOT filter on `status`: callers decide. The entry points
 * (`startQuiz`, `/quiz/[id]`) require `status === "OPEN"` so a student cannot
 * begin an unpublished quiz, while the in-attempt pages (`q/[index]`,
 * `review`, `result`) and `submitQuizAttempt` intentionally do not - an admin
 * unpublishing a quiz mid-attempt must not strand a student who is partway
 * through it, or leave them unable to see a result they already earned.
 *
 * (The previous version of this comment claimed it filtered for "published",
 * which it never did.)
 */
export const getVisibleQuiz = cache(async (quizId: string) => {
  return prisma.homework.findFirst({
    where: { id: quizId, mode: "QUIZ" },
    include: { questions: { orderBy: { order: "asc" }, include: { options: { orderBy: { order: "asc" } } } } },
  });
});

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
/**
 * One student's own cumulative total, under exactly the same rules as
 * getCumulativeLeaderboard below (COMPLETED or FAILED attempts, restricted to
 * quizzes belonging to `programId` - see that function's comment for the full
 * program-change policy).
 *
 * Exists because the quiz result page needs only this single number, and was
 * building the ENTIRE program leaderboard to read one entry out of it.
 * Pushing the sum into Postgres measured 2.3x faster on a 314-student program
 * (median ~51ms -> ~22ms) and, more importantly, no longer scales with the
 * number of students in the program. Verified to return the identical value.
 */
export async function getStudentCumulativeTotal(studentId: string, programId: string): Promise<number> {
  const aggregate = await prisma.quizAttempt.aggregate({
    where: {
      studentId,
      status: { in: ["COMPLETED", "FAILED"] },
      homework: { subject: { programId } },
    },
    _sum: { score: true },
  });
  return aggregate._sum.score ?? 0;
}

/**
 * Performance: the totals are summed by Postgres (one GROUP BY over this
 * program's attempts) instead of loading every attempt row into Node and
 * adding them up - on a 300-student program that was ~7,000 rows shipped per
 * page view just to produce 300 numbers. The roster and the aggregate are
 * independent, so they run in parallel. Same rules and same result as before:
 * students currently in the program (including those with no attempts yet),
 * COMPLETED + FAILED attempts on that program's own quizzes, ties by name.
 *
 * Wrapped in React's `cache()` so a page that needs it more than once in one
 * render (e.g. the dashboard's stats and its "top of the class" panel) only
 * computes it once.
 */
export const getCumulativeLeaderboard = cache(async (programId: string): Promise<CumulativeLeaderboardEntry[]> => {
  const [students, totals] = await Promise.all([
    prisma.user.findMany({
      where: { role: "STUDENT", programId },
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.quizAttempt.groupBy({
      by: ["studentId"],
      where: {
        status: { in: ["COMPLETED", "FAILED"] },
        homework: { subject: { programId } },
        student: { role: "STUDENT", programId },
      },
      _sum: { score: true },
      _count: { _all: true },
    }),
  ]);

  const totalByStudent = new Map(totals.map((t) => [t.studentId, t]));
  const entries: CumulativeLeaderboardEntry[] = students.map((s) => {
    const t = totalByStudent.get(s.id);
    return {
      studentId: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      totalScore: t?._sum.score ?? 0,
      completedQuizzes: t?._count._all ?? 0,
    };
  });

  entries.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    const nameA = `${a.lastName} ${a.firstName}`.toLowerCase();
    const nameB = `${b.lastName} ${b.firstName}`.toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return entries;
});
