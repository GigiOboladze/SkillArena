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

  const quiz = await prisma.homework.findFirst({ where: { id, mode: "QUIZ" }, include: { subject: { include: { program: { select: { name: true } } } } } });
  if (!quiz) notFound();
  if (admin.role !== "SUPER_ADMIN" && quiz.subject?.programId !== admin.programId) notFound();

  const action = createQuizQuestion.bind(null, id);

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
      <h1 className="sa-qn-title !text-4xl">Add a question</h1>

      <QuizQuestionForm action={action} error={error} submitLabel="Add question" />
    </section>
  );
}
