import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStudentForHomework } from "@/lib/student-session";

export default async function AsyncDonePage({
  params,
}: PageProps<"/play/[homeworkId]/done">) {
  const { homeworkId } = await params;
  const student = await getStudentForHomework(homeworkId);
  if (!student) redirect("/join");

  const homework = await prisma.homework.findUnique({ where: { id: homeworkId } });
  if (!homework) notFound();

  const answers = await prisma.answer.findMany({
    where: { studentId: student.id, question: { homeworkId } },
  });
  const totalScore = answers.reduce((sum, a) => sum + a.pointsAwarded, 0);
  const pendingGrading = answers.filter((a) => a.isCorrect === null).length;
  // Reached without finishing = the teacher closed the homework mid-way
  // (submitAsyncAnswer sends students here once it's no longer open).
  const closedEarly = !student.finishedAt && homework.status !== "OPEN";

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-sm font-bold uppercase tracking-wide text-rahoot-red">
        {closedEarly ? "Homework closed" : "All done!"}
      </p>
      <h1 className="mt-2 text-2xl font-bold">
        {closedEarly ? "Your teacher has closed this homework" : <>Nice work, {student.firstName}</>}
      </h1>
      <p className="mt-4 text-lg">
        Your score so far: <span className="font-black">{totalScore.toLocaleString()}</span>
      </p>
      {pendingGrading > 0 && (
        <p className="mt-1 text-sm text-rahoot-muted">
          {pendingGrading} answer{pendingGrading === 1 ? "" : "s"} still need grading by your teacher.
        </p>
      )}
      <Link href={`/play/${homeworkId}/leaderboard`} className="btn btn-primary mt-8">
        View leaderboard
      </Link>
    </div>
  );
}
