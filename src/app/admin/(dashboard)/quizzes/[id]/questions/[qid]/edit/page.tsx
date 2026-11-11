import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStaffWith } from "@/lib/staff-guard";
import { canManageQuiz } from "@/lib/scope";
import { updateQuizQuestion } from "../../../../actions";
import { QuizQuestionForm, type QuizQuestionDefaults } from "../../../../QuizQuestionForm";

export default async function EditQuizQuestionPage({
  params,
  searchParams,
}: PageProps<"/admin/quizzes/[id]/questions/[qid]/edit">) {
  const admin = await getStaffWith("quizzes.manage");
  if (!admin) notFound();

  const { id, qid } = await params;
  const search = await searchParams;
  const error = typeof search?.error === "string" ? search.error : null;

  const quiz = await prisma.homework.findFirst({ where: { id, mode: "QUIZ" }, include: { subject: { include: { program: { select: { name: true } } } } } });
  if (!quiz) notFound();
  if (!(await canManageQuiz(admin, quiz.id))) notFound();

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
    <section className="sa-qf">
      <header className="sa-qf-head">
        <div className="min-w-0">
          <Link href={`/admin/quizzes/${id}`} className="sa-mp-back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
              <path d="M19 12H5M11 6l-6 6 6 6" />
            </svg>
            Back to Quiz
          </Link>
          <div className="mt-3 flex items-center gap-4">
            <span className="sa-br-head-icon !h-16 !w-16" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
                <path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" />
                <path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5" />
              </svg>
            </span>
            <div className="min-w-0">
              <h1 className="text-3xl font-black tracking-tight sm:text-[2.6rem] sm:leading-tight">Edit Question</h1>
              <p className="mt-0.5 text-rahoot-muted sm:text-[1.05rem]">Update this question and its answers.</p>
            </div>
          </div>
        </div>
        {quiz.subject && (
          <div className="sa-mp-program">
            <span className="sa-mp-program-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4M13.5 6l-3 12" />
              </svg>
            </span>
            <span className="font-bold">Program</span>
            <span className="sa-mp-program-sep" aria-hidden />
            <span className="truncate font-semibold">{quiz.subject.program.name}</span>
          </div>
        )}
      </header>

      <QuizQuestionForm action={action} defaults={defaults} error={error} submitLabel="Save Changes" />
    </section>
  );
}
