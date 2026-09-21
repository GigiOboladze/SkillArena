import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function StudentAttemptAnswersPage({
  params,
}: PageProps<"/admin/students/[id]/attempts/[attemptId]">) {
  const { id, attemptId } = await params;

  const attempt = await prisma.quizAttempt.findFirst({
    // Scoped to this student too, not just the attempt id - an admin
    // guessing/editing the attemptId in the URL can never pull up a
    // different student's answers through this page.
    where: { id: attemptId, studentId: id },
    include: {
      student: { select: { firstName: true, lastName: true, username: true } },
      homework: {
        select: {
          id: true,
          title: true,
          questions: { orderBy: { order: "asc" }, include: { options: { orderBy: { order: "asc" } } } },
        },
      },
      answers: true,
    },
  });
  if (!attempt) notFound();

  const answerByQuestion = new Map(attempt.answers.map((a) => [a.questionId, a]));

  return (
    <div>
      <Link href={`/admin/students/${id}`} className="text-sm text-rahoot-red hover:underline">
        &larr; Back to {attempt.student.firstName} {attempt.student.lastName}
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{attempt.homework.title}</h1>
      <p className="mt-1 text-sm text-rahoot-muted">
        @{attempt.student.username} &middot; Score {attempt.score} / {attempt.totalQuestions} &middot;{" "}
        {(attempt.completedAt ?? attempt.startedAt).toLocaleString()}
      </p>

      <ol className="mt-6 flex flex-col gap-2">
        {attempt.homework.questions.map((question, index) => {
          const answer = answerByQuestion.get(question.id);
          const correctOption = question.options.find((o) => o.isCorrect);
          const selectedOption = question.options.find((o) => o.id === answer?.selectedOptionId);

          return (
            <li key={question.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold">
                  {index + 1}. {question.text}
                </p>
                <span className={`badge shrink-0 ${answer?.isCorrect ? "badge-success" : "badge-danger"}`}>
                  {answer?.isCorrect ? "Correct" : "Incorrect"}
                </span>
              </div>
              <p className="mt-2 text-sm text-rahoot-muted">Answer: {selectedOption?.text ?? "Not answered"}</p>
              {!answer?.isCorrect && (
                <p className="text-sm text-rahoot-muted">Correct answer: {correctOption?.text}</p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
