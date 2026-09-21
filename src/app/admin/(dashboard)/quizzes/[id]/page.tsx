import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/session";
import {
  updateQuizDetails,
  updateQuizTargeting,
  setQuizStatus,
  deleteQuiz,
  deleteQuizQuestion,
  moveQuizQuestion,
} from "../actions";
import { DeleteQuizButton } from "../DeleteQuizButton";
import { QuizTargetingForm } from "./QuizTargetingForm";
import { listSubjectsWithGroups } from "@/lib/subjects";

const STATUS_FLOW: Array<{ value: "DRAFT" | "OPEN" | "CLOSED"; label: string; hint: string }> = [
  { value: "DRAFT", label: "Draft", hint: "Hidden - students can't see or open this quiz yet" },
  { value: "OPEN", label: "Published", hint: "Visible to every student on their dashboard" },
  { value: "CLOSED", label: "Unpublished", hint: "Hidden again - past results are kept" },
];

const TARGETING_ERROR_MESSAGES: Record<string, string> = {
  subject: "Please choose a subject.",
  publish: "Add at least one question, and set a subject and at least one target group, before publishing.",
  lastquestion: "Can't delete the last question of a published quiz - unpublish it first, or add another question before removing this one.",
};

export default async function ManageQuizPage({
  params,
  searchParams,
}: PageProps<"/admin/quizzes/[id]">) {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const { id } = await params;
  const search = await searchParams;
  const detailsError = search?.error === "title";
  const targetingError = typeof search?.error === "string" ? TARGETING_ERROR_MESSAGES[search.error] ?? null : null;

  const quiz = await prisma.homework.findFirst({
    where: { id, mode: "QUIZ" },
    include: {
      subject: true,
      questions: { orderBy: { order: "asc" }, include: { options: { orderBy: { order: "asc" } } } },
      targetGroups: true,
      _count: { select: { quizAttempts: true } },
    },
  });
  if (!quiz) notFound();
  // Ownership check: a regular Admin may only manage a quiz belonging to
  // their own program (via the quiz's subject) - hiding it from their list
  // is not what makes this safe.
  if (admin.role !== "SUPER_ADMIN" && quiz.subject?.programId !== admin.programId) notFound();

  const subjects = quiz.subject ? await listSubjectsWithGroups(quiz.subject.programId) : [];

  const updateDetails = updateQuizDetails.bind(null, quiz.id);
  const updateTargeting = updateQuizTargeting.bind(null, quiz.id);
  const removeQuiz = deleteQuiz.bind(null, quiz.id);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{quiz.title}</h1>
          <p className="mt-1 text-sm text-rahoot-muted">
            {quiz.questions.length} question{quiz.questions.length === 1 ? "" : "s"} &middot;{" "}
            {quiz._count.quizAttempts} attempt{quiz._count.quizAttempts === 1 ? "" : "s"}
          </p>
        </div>
        <Link href={`/admin/quizzes/${quiz.id}/results`} className="btn btn-outline">
          View results
        </Link>
      </div>

      <section className="card p-6">
        <h2 className="font-bold">Publishing</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {STATUS_FLOW.map((s) => {
            const active = quiz.status === s.value;
            const action = setQuizStatus.bind(null, quiz.id, s.value);
            return (
              <form action={action} key={s.value}>
                <button
                  type="submit"
                  disabled={active}
                  title={s.hint}
                  className={active ? "btn btn-primary" : "btn btn-outline"}
                >
                  {s.label}
                </button>
              </form>
            );
          })}
        </div>
        {targetingError && <p className="mt-3 text-sm font-medium text-rahoot-red">{targetingError}</p>}
      </section>

      <section className="card p-6">
        <h2 className="font-bold">Subject &amp; target groups</h2>
        <p className="mt-1 text-sm text-rahoot-muted">
          Only students whose group (for this subject) is checked below will see this quiz.
        </p>
        <div className="mt-4">
          <QuizTargetingForm
            action={updateTargeting}
            subjects={subjects}
            currentSubjectId={quiz.subjectId}
            currentGroupIds={quiz.targetGroups.map((g) => g.groupId)}
          />
        </div>
      </section>

      <section className="card p-6">
        <h2 className="font-bold">Details</h2>
        <form action={updateDetails} className="mt-4 flex flex-col gap-3">
          <label className="text-sm font-semibold">
            Title
            <input name="title" required maxLength={120} defaultValue={quiz.title} className="input mt-1" />
          </label>
          {detailsError && <p className="text-sm font-medium text-rahoot-red">Please enter a title.</p>}
          <button type="submit" className="btn btn-outline self-start">
            Save details
          </button>
        </form>
      </section>

      <section className="card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">
            Questions <span className="font-normal text-rahoot-muted">({quiz.questions.length})</span>
          </h2>
          <Link href={`/admin/quizzes/${quiz.id}/questions/new`} className="btn btn-primary">
            + Add question
          </Link>
        </div>

        {quiz.questions.length === 0 ? (
          <p className="mt-4 text-sm text-rahoot-muted">No questions yet.</p>
        ) : (
          <ol className="mt-4 flex flex-col gap-2">
            {quiz.questions.map((q, i) => {
              const removeQuestion = deleteQuizQuestion.bind(null, quiz.id, q.id);
              const moveUp = moveQuizQuestion.bind(null, quiz.id, q.id, "up");
              const moveDown = moveQuizQuestion.bind(null, quiz.id, q.id, "down");
              return (
                <li key={q.id} className="flex items-center justify-between gap-3 rounded-lg border border-rahoot-border p-3">
                  <div className="flex items-center gap-1">
                    <form action={moveUp}>
                      <button
                        type="submit"
                        disabled={i === 0}
                        title="Move up"
                        className="rounded px-2 py-1 text-rahoot-muted hover:text-rahoot-red disabled:opacity-30"
                      >
                        &uarr;
                      </button>
                    </form>
                    <form action={moveDown}>
                      <button
                        type="submit"
                        disabled={i === quiz.questions.length - 1}
                        title="Move down"
                        className="rounded px-2 py-1 text-rahoot-muted hover:text-rahoot-red disabled:opacity-30"
                      >
                        &darr;
                      </button>
                    </form>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">
                      {i + 1}. {q.text}
                    </p>
                    <p className="text-xs text-rahoot-muted">
                      Correct: {q.options.find((o) => o.isCorrect)?.text ?? "-"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Link
                      href={`/admin/quizzes/${quiz.id}/questions/${q.id}/edit`}
                      className="btn btn-outline !py-1.5 !px-3 text-sm"
                    >
                      Edit
                    </Link>
                    <form action={removeQuestion}>
                      <button type="submit" className="btn btn-outline !py-1.5 !px-3 text-sm">
                        Delete
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <form action={removeQuiz} className="self-start">
        <DeleteQuizButton title={quiz.title} />
      </form>
    </div>
  );
}
