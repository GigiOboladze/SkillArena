import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/session";
import { createQuizQuestion } from "../../../actions";
import { QuizQuestionForm } from "../../../QuizQuestionForm";

export default async function NewQuizQuestionPage({
  params,
  searchParams,
}: PageProps<"/admin/quizzes/[id]/questions/new">) {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const { id } = await params;
  const search = await searchParams;
  const error = typeof search?.error === "string" ? search.error : null;

  const quiz = await prisma.homework.findFirst({ where: { id, mode: "QUIZ" }, include: { subject: true } });
  if (!quiz) notFound();
  if (admin.role !== "SUPER_ADMIN" && quiz.subject?.programId !== admin.programId) notFound();

  const action = createQuizQuestion.bind(null, id);

  return (
    <div className="mx-auto max-w-lg">
      <Link href={`/admin/quizzes/${id}`} className="text-sm text-rahoot-red hover:underline">
        &larr; Back to quiz
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Add a question</h1>

      <div className="mt-6">
        <QuizQuestionForm action={action} error={error} submitLabel="Add question" />
      </div>
    </div>
  );
}
