import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/session";

const STATUS_STYLES: Record<string, string> = {
  IN_PROGRESS: "badge-neutral",
  COMPLETED: "badge-success",
  FAILED: "badge-danger",
};

export default async function QuizResultsPage({
  params,
}: PageProps<"/admin/quizzes/[id]/results">) {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const { id } = await params;

  const quiz = await prisma.homework.findFirst({
    where: { id, mode: "QUIZ" },
    include: {
      subject: true,
      quizAttempts: {
        include: { student: true },
        orderBy: [{ score: "desc" }, { startedAt: "asc" }],
      },
      _count: { select: { questions: true } },
    },
  });
  if (!quiz) notFound();
  if (admin.role !== "SUPER_ADMIN" && quiz.subject?.programId !== admin.programId) notFound();

  return (
    <div>
      <Link href={`/admin/quizzes/${id}`} className="text-sm text-rahoot-red hover:underline">
        &larr; Back to quiz
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{quiz.title} - results</h1>
      <p className="mt-1 text-sm text-rahoot-muted">
        {quiz.quizAttempts.length} attempt{quiz.quizAttempts.length === 1 ? "" : "s"}
      </p>

      {quiz.quizAttempts.length === 0 ? (
        <p className="mt-8 text-rahoot-muted">No students have attempted this quiz yet.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-y-2">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-rahoot-muted">
                <th className="px-3">Student</th>
                <th className="px-3">Status</th>
                <th className="px-3">Score</th>
                <th className="px-3">Tab switches</th>
                <th className="px-3">Reason</th>
                <th className="px-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {quiz.quizAttempts.map((attempt) => (
                <tr key={attempt.id} className="card">
                  <td className="px-3 py-3 font-semibold">
                    <Link href={`/admin/students/${attempt.studentId}`} className="hover:text-rahoot-red hover:underline">
                      {attempt.student.firstName} {attempt.student.lastName}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`badge ${STATUS_STYLES[attempt.status]}`}>{attempt.status}</span>
                  </td>
                  <td className="px-3 py-3 font-mono">
                    {attempt.score} / {quiz._count.questions}
                  </td>
                  <td className="px-3 py-3">{attempt.tabSwitchCount}</td>
                  <td className="px-3 py-3 text-sm text-rahoot-muted">{attempt.failureReason ?? "-"}</td>
                  <td className="px-3 py-3 text-sm text-rahoot-muted">
                    {(attempt.completedAt ?? attempt.startedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
