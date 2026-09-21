import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/session";
import { updateQuizQuestion } from "../../../../actions";
import { QuizQuestionForm, type QuizQuestionDefaults } from "../../../../QuizQuestionForm";

export default async function EditQuizQuestionPage({
  params,
  searchParams,
}: PageProps<"/admin/quizzes/[id]/questions/[qid]/edit">) {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const { id, qid } = await params;
  const search = await searchParams;
  const error = typeof search?.error === "string" ? search.error : null;

  const quiz = await prisma.homework.findFirst({ where: { id, mode: "QUIZ" }, include: { subject: true } });
  if (!quiz) notFound();
  if (admin.role !== "SUPER_ADMIN" && quiz.subject?.programId !== admin.programId) notFound();

  const question = await prisma.question.findFirst({
    where: { id: qid, homeworkId: id },
    include: { options: { orderBy: { order: "asc" } } },
  });
  if (!question) notFound();

  const defaults: QuizQuestionDefaults = {
    text: question.text,
    options: question.options.map((o) => o.text),
    correctIndex:
      question.options.findIndex((o) => o.isCorrect) >= 0
        ? question.options.findIndex((o) => o.isCorrect) + 1
        : null,
  };

  const action = updateQuizQuestion.bind(null, id, qid);

  return (
    <div className="mx-auto max-w-lg">
      <Link href={`/admin/quizzes/${id}`} className="text-sm text-rahoot-red hover:underline">
        &larr; Back to quiz
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Edit question</h1>

      <div className="mt-6">
        <QuizQuestionForm action={action} defaults={defaults} error={error} submitLabel="Save changes" />
      </div>
    </div>
  );
}
