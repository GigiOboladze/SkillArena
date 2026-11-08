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

  const quiz = await prisma.homework.findFirst({ where: { id, mode: "QUIZ" }, include: { subject: { include: { program: { select: { name: true } } } } } });
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
    <section className="sa-qn">
      {quiz.subject && (
        <div className="sa-qn-program">
          <span className="sa-qn-program-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4M13.5 5.5l-3 13" />
            </svg>
          </span>
          <span className="text-sm font-semibold">Program</span>
          <span className="sa-qd-divider" aria-hidden />
          <span className="truncate text-sm font-semibold">{quiz.subject.program.name}</span>
        </div>
      )}

      <Link href={`/admin/quizzes/${id}`} className="sa-qn-back">
        &larr; Back to quiz
      </Link>
      <h1 className="sa-qn-title !text-4xl">Edit question</h1>

      <QuizQuestionForm action={action} defaults={defaults} error={error} submitLabel="Save changes" />
    </section>
  );
}
