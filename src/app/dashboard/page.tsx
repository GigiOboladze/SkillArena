import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStudent } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getCumulativeLeaderboard } from "@/lib/quiz";
import { eligibleHomeworkWhere, getUngroupedSubjectAssignments } from "@/lib/subjects";

export default async function StudentDashboardPage() {
  const student = await getCurrentStudent();
  if (!student) redirect("/login");
  if (!student.programId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <h1 className="text-xl font-bold">No program assigned yet</h1>
        <p className="mt-2 max-w-sm text-sm text-rahoot-muted">
          Your account isn&apos;t assigned to a program yet, so there are no quizzes to show. Ask your instructor to
          assign you to a program.
        </p>
      </div>
    );
  }

  const eligibleWhere = await eligibleHomeworkWhere(student.id);

  const [program, publishedQuizzes, attempts, leaderboard, ungroupedSubjects] = await Promise.all([
    prisma.program.findUnique({ where: { id: student.programId } }),
    prisma.homework.findMany({
      where: { mode: "QUIZ", status: "OPEN", ...eligibleWhere },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { questions: true } }, subject: true },
    }),
    prisma.quizAttempt.findMany({
      where: { studentId: student.id },
      include: { homework: { select: { id: true, title: true } } },
      orderBy: { startedAt: "desc" },
    }),
    getCumulativeLeaderboard(student.programId),
    getUngroupedSubjectAssignments(student.id),
  ]);

  const attemptByQuiz = new Map(attempts.map((a) => [a.homeworkId, a]));
  const availableQuizzes = publishedQuizzes.filter((q) => !attemptByQuiz.has(q.id));
  const finishedAttempts = attempts.filter((a) => a.status !== "IN_PROGRESS");

  const leaderboardEntry = leaderboard.find((e) => e.studentId === student.id);
  const totalScore = leaderboardEntry?.totalScore ?? 0;
  // Scoped to the current program (matches the leaderboard/profile total),
  // not `finishedAttempts.length` below - that list intentionally keeps
  // showing full history across any past program for review purposes.
  const completedInProgram = leaderboardEntry?.completedQuizzes ?? 0;
  const rank = leaderboard.findIndex((e) => e.studentId === student.id) + 1;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Welcome back, {student.firstName}.</h1>
        {program && <p className="mt-1 text-sm text-rahoot-muted">{program.name}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:w-fit">
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-rahoot-muted">Total points</div>
          <div className="text-2xl font-black">{totalScore}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-rahoot-muted">Quizzes completed</div>
          <div className="text-2xl font-black">{completedInProgram}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-rahoot-muted">Current rank</div>
          <div className="text-2xl font-black">{rank > 0 ? `#${rank}` : "-"}</div>
        </div>
      </div>

      {ungroupedSubjects.length > 0 && (
        <div className="card flex flex-col gap-2 p-4">
          <p className="text-sm font-semibold">Waiting on a group assignment</p>
          {ungroupedSubjects.map((sg) => (
            <p key={sg.id} className="text-sm text-rahoot-muted">
              <span className="font-medium text-rahoot-ink">{sg.subject.name}</span> - you&apos;re assigned to this
              subject, but no group has been set for you yet, so its quizzes aren&apos;t available. Ask your
              instructor to assign your group.
            </p>
          ))}
        </div>
      )}

      <section>
        <h2 className="font-bold">Available quizzes</h2>
        {availableQuizzes.length === 0 ? (
          <div className="card mt-3 flex flex-col items-center gap-2 p-10 text-center">
            <span className="text-4xl">💪😈</span>
            <p className="mt-2 text-lg font-bold">ქვიზები მალე დაემატება</p>
            <p className="text-sm text-rahoot-muted">
              You&apos;ve completed everything available right now - check back after the next lecture.
            </p>
          </div>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {availableQuizzes.map((quiz) => (
              <li key={quiz.id} className="card card-interactive flex flex-col p-5">
                {quiz.subject && (
                  <span className="badge self-start bg-rahoot-red-light text-rahoot-red">{quiz.subject.name}</span>
                )}
                <p className="mt-2 text-lg font-bold">{quiz.title}</p>
                <p className="mt-1 text-sm text-rahoot-muted">
                  {quiz._count.questions} question{quiz._count.questions === 1 ? "" : "s"} &middot;{" "}
                  {quiz._count.questions} point{quiz._count.questions === 1 ? "" : "s"}
                </p>
                <p className="text-sm text-rahoot-muted">100 sec / question</p>
                <Link href={`/quiz/${quiz.id}`} className="btn btn-primary mt-4 self-start">
                  Start Quiz &rarr;
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-bold">Completed quizzes</h2>
        {finishedAttempts.length === 0 ? (
          <p className="mt-3 text-rahoot-muted">No completed quizzes yet.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {finishedAttempts.map((attempt) => (
              <li key={attempt.id} className="card flex flex-col p-5">
                <span
                  className={`badge self-start ${
                    attempt.status === "FAILED" ? "badge-danger" : "badge-success"
                  }`}
                >
                  {attempt.status === "FAILED" ? "Failed" : "✓ Completed"}
                </span>
                <p className="mt-2 text-lg font-bold">{attempt.homework.title}</p>
                <p className="mt-1 text-sm text-rahoot-muted">
                  Score: {attempt.score} / {attempt.totalQuestions}
                </p>
                <Link
                  href={`/quiz/${attempt.homeworkId}/result`}
                  className="btn btn-outline mt-4 self-start !py-1.5 !px-4 text-sm"
                >
                  Review
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
