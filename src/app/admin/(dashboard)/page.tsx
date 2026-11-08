import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/session";
import { getCumulativeLeaderboard } from "@/lib/quiz";
import { getProgram, resolveAdminProgramScope } from "@/lib/programs";
import { requestNow, timeAgo } from "@/lib/time-ago";
import type { Prisma } from "@/generated/prisma/client";
import { AdminOverviewView } from "@/components/admin/AdminOverviewView";

const WEEK_MS = 7 * 24 * 3600 * 1000;

export default async function AdminOverviewPage() {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const isSuper = admin.role === "SUPER_ADMIN";

  // A regular Admin's overview is scoped to their own program; the Super
  // Admin sees totals across every program (the per-program breakdowns live
  // in Students/Quizzes/Leaderboard, which already have a program selector).
  // The CHECK constraint on User guarantees a non-SUPER_ADMIN always has a
  // programId, but this sentinel keeps the query well-defined for the type
  // checker (and matches nothing, rather than everything, in the impossible
  // case it's ever missing).
  const ownProgramId = admin.programId ?? "__no_program__";
  const quizWhere: Prisma.HomeworkWhereInput = isSuper
    ? { mode: "QUIZ" }
    : { mode: "QUIZ", subject: { programId: ownProgramId } };
  const studentWhere: Prisma.UserWhereInput = isSuper
    ? { role: "STUDENT" }
    : { role: "STUDENT", programId: ownProgramId };
  const attemptWhere: Prisma.QuizAttemptWhereInput = isSuper
    ? { status: { in: ["COMPLETED", "FAILED"] } }
    : { status: { in: ["COMPLETED", "FAILED"] }, homework: { subject: { programId: ownProgramId } } };

  const now = requestNow();
  const weekAgo = new Date(now - WEEK_MS);

  // "Top students" needs one concrete program. A regular Admin's is their
  // own; the Super Admin gets the same default program the Leaderboard page
  // opens on (resolveAdminProgramScope with no explicit choice).
  const [
    quizCount,
    publishedQuizCount,
    studentCount,
    attemptCount,
    attemptsThisWeek,
    recentAttempts,
    liveHomeworks,
    topOfProgram,
    openBugReports,
    newInco,
  ] = await Promise.all([
    prisma.homework.count({ where: quizWhere }),
    prisma.homework.count({ where: { ...quizWhere, status: "OPEN" } }),
    prisma.user.count({ where: studentWhere }),
    prisma.quizAttempt.count({ where: attemptWhere }),
    prisma.quizAttempt.count({ where: { ...attemptWhere, completedAt: { gte: weekAgo } } }),
    prisma.quizAttempt.findMany({
      where: attemptWhere,
      orderBy: [{ completedAt: { sort: "desc", nulls: "last" } }, { startedAt: "desc" }],
      take: 6,
      include: {
        student: { select: { firstName: true, lastName: true } },
        homework: { select: { title: true } },
      },
    }),
    prisma.homework.findMany({
      where: { mode: "LIVE" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { _count: { select: { students: true } } },
    }),
    resolveAdminProgramScope(admin, undefined).then(async (programId) => {
      if (!programId) return { entries: [], program: null };
      const [entries, program] = await Promise.all([getCumulativeLeaderboard(programId), getProgram(programId)]);
      return { entries, program };
    }),
    // Same counts the sidebar badges show (bug reports are global; INCO is
    // Super-Admin-only and never queried for a regular Admin).
    prisma.bugReport.count({ where: { status: "OPEN" } }),
    isSuper ? prisma.incoSubmission.count({ where: { status: "NEW" } }) : Promise.resolve(0),
  ]);

  const ownProgram = isSuper ? null : topOfProgram.program;

  return (
    <AdminOverviewView
      firstName={admin.firstName && admin.firstName !== "Admin" ? admin.firstName : admin.username}
      isSuper={isSuper}
      scopeLabel={isSuper ? "All programs" : (ownProgram?.name ?? "Your program")}
      quizCount={quizCount}
      publishedQuizCount={publishedQuizCount}
      studentCount={studentCount}
      attemptCount={attemptCount}
      attemptsThisWeek={attemptsThisWeek}
      recentAttempts={recentAttempts.map((a) => ({
        id: a.id,
        homeworkId: a.homeworkId,
        studentName: `${a.student.firstName} ${a.student.lastName}`,
        quizTitle: a.homework.title,
        score: a.score,
        totalQuestions: a.totalQuestions,
        failed: a.status === "FAILED",
        ago: timeAgo(a.completedAt ?? a.startedAt, now),
      }))}
      liveSessions={liveHomeworks.map((hw) => ({
        id: hw.id,
        title: hw.title,
        joined: hw._count.students,
        status: hw.status,
      }))}
      topStudents={topOfProgram.entries.slice(0, 5)}
      topStudentsProgram={isSuper ? (topOfProgram.program?.name ?? null) : null}
      openBugReports={openBugReports}
      newInco={newInco}
    />
  );
}
