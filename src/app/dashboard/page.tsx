import { redirect } from "next/navigation";
import { getCurrentStudent } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getCumulativeLeaderboard } from "@/lib/quiz";
import { eligibleHomeworkWhere, getUngroupedSubjectAssignments } from "@/lib/subjects";
import { getProgram } from "@/lib/programs";
import { requestNow, timeAgo } from "@/lib/time-ago";
import { DashboardView, type DashboardStanding } from "@/components/student/DashboardView";
import { SCHEDULE_VIEWS, schoolWeekday, type ScheduleView } from "@/lib/schedule";
import { NEWS, NEWS_ROTATE_MS } from "@/lib/news";

const WEEK_MS = 7 * 24 * 3600 * 1000;

export default async function StudentDashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const search = await searchParams;
  const scheduleView: ScheduleView = SCHEDULE_VIEWS.some((v) => v.key === search?.schedule)
    ? (search?.schedule as ScheduleView)
    : "week";
  const student = await getCurrentStudent();
  if (!student) redirect("/login");
  if (!student.programId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-24 text-center">
        <h1 className="text-xl font-bold">No program assigned yet</h1>
        <p className="mt-2 max-w-sm text-sm text-rahoot-muted">
          Your account isn&apos;t assigned to a program yet, so there are no quizzes to show. Ask your instructor to
          assign you to a program.
        </p>
      </div>
    );
  }

  const programId = student.programId;

  // Everything below is independent, so it all runs in one parallel batch.
  // The eligible-quiz list needs the student's memberships first, so that
  // pair is chained inside the batch rather than holding up the rest.
  const [program, publishedQuizzes, attempts, leaderboard, ungroupedSubjects, scheduleEntries] = await Promise.all([
    getProgram(programId),
    eligibleHomeworkWhere(student.id, programId).then((eligibleWhere) =>
      prisma.homework.findMany({
        where: { mode: "QUIZ", status: "OPEN", ...eligibleWhere },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { questions: true } }, subject: { select: { name: true } } },
      }),
    ),
    prisma.quizAttempt.findMany({
      where: { studentId: student.id },
      include: { homework: { select: { id: true, title: true, subject: { select: { programId: true } } } } },
      orderBy: { startedAt: "desc" },
    }),
    getCumulativeLeaderboard(programId),
    getUngroupedSubjectAssignments(student.id),
    prisma.scheduleEntry.findMany({
      where: { studentId: student.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  // "Today"/"Tomorrow" use the school's own calendar day, not the server's.
  const today = schoolWeekday();
  const wantedDay = scheduleView === "today" ? today : scheduleView === "tomorrow" ? (today % 7) + 1 : null;
  const schedule = scheduleEntries
    .filter((e) => wantedDay === null || e.days.includes(wantedDay))
    .sort((a, b) => (wantedDay === null ? 0 : a.startTime.localeCompare(b.startTime)))
    .map((e) => ({
      id: e.id,
      title: e.title,
      days: e.days,
      startTime: e.startTime,
      endTime: e.endTime,
      room: e.room,
      tone: e.tone,
      icon: e.icon,
    }));

  const attemptByQuiz = new Map(attempts.map((a) => [a.homeworkId, a]));
  const availableQuizzes = publishedQuizzes.filter((q) => !attemptByQuiz.has(q.id));
  const finishedAttempts = attempts.filter((a) => a.status !== "IN_PROGRESS");
  // A started-but-unsubmitted attempt is excluded from BOTH lists above
  // (from "available" because an attempt exists, and from "completed" because
  // it isn't finished), which previously left it with no link anywhere on the
  // dashboard - a student who closed the tab mid-quiz could only return via a
  // URL they no longer had. Surfaced explicitly in "Continue where you left off".
  const inProgressAttempts = attempts.filter((a) => a.status === "IN_PROGRESS");

  const leaderboardEntry = leaderboard.find((e) => e.studentId === student.id);
  const totalScore = leaderboardEntry?.totalScore ?? 0;
  // Scoped to the current program (matches the leaderboard/profile total),
  // not `finishedAttempts.length` - that list intentionally keeps showing
  // full history across any past program for review purposes.
  const completedInProgram = leaderboardEntry?.completedQuizzes ?? 0;
  const rankIndex = leaderboard.findIndex((e) => e.studentId === student.id);
  const rank = rankIndex + 1;

  // "This week" deltas use the same program scoping as the totals above, so
  // the "+N" can never exceed the number it sits next to.
  const now = requestNow();
  const finishedAt = (a: (typeof attempts)[number]) => a.completedAt ?? a.startedAt;
  const finishedThisWeekInProgram = finishedAttempts.filter(
    (a) => a.homework.subject?.programId === programId && now - finishedAt(a).getTime() < WEEK_MS,
  );

  const standings: DashboardStanding[] = leaderboard.slice(0, 3).map((e, i) => ({ ...e, rank: i + 1 }));
  if (leaderboardEntry && rankIndex >= 3) standings.push({ ...leaderboardEntry, rank });

  const activity = [...finishedAttempts]
    .sort((a, b) => finishedAt(b).getTime() - finishedAt(a).getTime())
    .slice(0, 5)
    .map((a) => ({
      id: a.id,
      title: a.homework.title,
      failed: a.status === "FAILED",
      points: a.score,
      ago: timeAgo(finishedAt(a), now),
    }));

  return (
    <DashboardView
      studentId={student.id}
      firstName={student.firstName}
      programName={program?.name ?? null}
      totalScore={totalScore}
      pointsThisWeek={finishedThisWeekInProgram.reduce((sum, a) => sum + a.score, 0)}
      completedInProgram={completedInProgram}
      completedThisWeek={finishedThisWeekInProgram.length}
      rank={rank}
      rankedCount={leaderboard.length}
      ungroupedSubjects={ungroupedSubjects.map((sg) => ({ id: sg.id, subjectName: sg.subject.name }))}
      inProgress={inProgressAttempts.map((a) => ({ id: a.id, homeworkId: a.homeworkId, title: a.homework.title }))}
      available={availableQuizzes.map((q) => ({
        id: q.id,
        title: q.title,
        subjectName: q.subject?.name ?? null,
        questionCount: q._count.questions,
      }))}
      completed={finishedAttempts.map((a) => ({
        id: a.id,
        homeworkId: a.homeworkId,
        title: a.homework.title,
        failed: a.status === "FAILED",
        score: a.score,
        totalQuestions: a.totalQuestions,
      }))}
      activity={activity}
      standings={standings}
      schedule={schedule}
      scheduleView={scheduleView}
      hasAnySchedule={scheduleEntries.length > 0}
      news={NEWS}
      newsIntervalMs={NEWS_ROTATE_MS}
    />
  );
}
