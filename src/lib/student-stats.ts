import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getCumulativeLeaderboard } from "@/lib/quiz";

export type StudentStats = {
  /** ArenaPoints: cumulative quiz score in the student's current program (same number as the leaderboard). */
  points: number;
  /** Correct answers / questions, over completed + failed quizzes; null before any finished quiz. */
  accuracy: number | null;
  /** 1-based leaderboard position in the program. */
  rank: number;
  finishedQuizzes: number;
};

/**
 * Per-student numbers for a whole program in two queries (the cached
 * leaderboard + one aggregate), shared by the students list and profile.
 */
export const getProgramStudentStats = cache(async (programId: string) => {
  const [board, totals] = await Promise.all([
    getCumulativeLeaderboard(programId),
    prisma.quizAttempt.groupBy({
      by: ["studentId"],
      where: {
        status: { in: ["COMPLETED", "FAILED"] },
        homework: { subject: { programId } },
        student: { role: "STUDENT", programId },
      },
      _sum: { score: true, totalQuestions: true },
      _count: { _all: true },
    }),
  ]);

  const totalsByStudent = new Map(totals.map((t) => [t.studentId, t]));
  const stats = new Map<string, StudentStats>();
  let programScore = 0;
  let programQuestions = 0;
  board.forEach((entry, index) => {
    const t = totalsByStudent.get(entry.studentId);
    const questions = t?._sum.totalQuestions ?? 0;
    const score = t?._sum.score ?? 0;
    programScore += score;
    programQuestions += questions;
    stats.set(entry.studentId, {
      points: entry.totalScore,
      accuracy: questions > 0 ? Math.round((score / questions) * 100) : null,
      rank: index + 1,
      finishedQuizzes: t?._count._all ?? 0,
    });
  });

  return {
    board,
    stats,
    totalPoints: board.reduce((sum, e) => sum + e.totalScore, 0),
    averageAccuracy: programQuestions > 0 ? Math.round((programScore / programQuestions) * 100) : null,
  };
});

export type MotivationLevel = { label: string; tone: "good" | "medium" | "bad" };

/** 75-100 going well, 40-74 medium, 0-39 something is going badly. */
export function motivationLevel(value: number | null | undefined): MotivationLevel | null {
  if (value === null || value === undefined) return null;
  if (value >= 75) return { label: "Going well", tone: "good" };
  if (value >= 40) return { label: "Medium", tone: "medium" };
  return { label: "Needs attention", tone: "bad" };
}
