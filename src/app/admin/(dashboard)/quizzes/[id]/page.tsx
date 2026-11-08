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
import { IconPlus, IconUsers } from "@/components/student/Icons";

const STATUS_FLOW: Array<{ value: "DRAFT" | "OPEN" | "CLOSED"; label: string; hint: string }> = [
  { value: "DRAFT", label: "Draft", hint: "Hidden - students can't see or open this quiz yet" },
  { value: "OPEN", label: "Published", hint: "Visible to every student on their dashboard" },
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
      subject: { include: { program: { select: { name: true } } } },
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

  const selectedSubject = subjects.find((sub) => sub.id === quiz.subjectId);
  const changeSubject = updateTargeting;

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

      <Link href="/admin/quizzes" className="sa-qn-back">
        &larr; Back to quizzes
      </Link>
      <h1 className="sa-qn-title break-words">{quiz.title}</h1>
      <p className="sa-qd-meta">
        {quiz.questions.length} question{quiz.questions.length === 1 ? "" : "s"}
        <span aria-hidden>&bull;</span>
        {quiz._count.quizAttempts} attempt{quiz._count.quizAttempts === 1 ? "" : "s"}
      </p>

      {/* ---------------- Status + results ---------------- */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <div className="sa-qd-segment" role="group" aria-label="Quiz status">
          {STATUS_FLOW.map((s) => {
            // Older quizzes may still be CLOSED ("Unpublished", no longer offered) - they show as Draft.
            const active = (quiz.status === "CLOSED" ? "DRAFT" : quiz.status) === s.value;
            const action = setQuizStatus.bind(null, quiz.id, s.value);
            return (
              <form action={action} key={s.value}>
                <button type="submit" disabled={active} title={s.hint} className={active ? "is-active" : undefined}>
                  {s.label}
                </button>
              </form>
            );
          })}
        </div>
        <Link href={`/admin/quizzes/${quiz.id}/results`} className="sa-qd-outline">
          View results
        </Link>
      </div>
      {targetingError && <p className="mt-3 text-sm font-medium text-rahoot-red">{targetingError}</p>}

      {/* ---------------- Target group ---------------- */}
      <div className="sa-qd-card mt-5">
        <div className="flex items-center gap-5">
          <IconUsers className="h-10 w-10 flex-none text-rahoot-red" />
          <div>
            <h2 className="text-lg font-bold">Target Group</h2>
            <p className="mt-0.5 text-rahoot-muted">Select the target group for this quiz.</p>
          </div>
        </div>
        <div className="mt-5">
          {quiz.subjectId ? (
            <QuizTargetingForm
              key={quiz.subjectId}
              action={updateTargeting}
              subjectId={quiz.subjectId}
              groups={selectedSubject?.groups ?? []}
              currentGroupIds={quiz.targetGroups.map((g) => g.groupId)}
            />
          ) : (
            <p className="text-sm text-rahoot-muted">Choose a subject under Quiz settings first.</p>
          )}
        </div>
      </div>

      {/* ---------------- Questions ---------------- */}
      <div className="sa-qd-card mt-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-bold">
            Questions <span className="text-rahoot-red">({quiz.questions.length})</span>
          </h2>
          <Link href={`/admin/quizzes/${quiz.id}/questions/new`} className="sa-qd-primary">
            <IconPlus className="h-5 w-5" />
            Add question
          </Link>
        </div>

        {quiz.questions.length === 0 ? (
          <p className="mt-2 text-rahoot-muted">No questions yet.</p>
        ) : (
          <ol className="mt-4 flex flex-col gap-2">
            {quiz.questions.map((q, i) => {
              const removeQuestion = deleteQuizQuestion.bind(null, quiz.id, q.id);
              const moveUp = moveQuizQuestion.bind(null, quiz.id, q.id, "up");
              const moveDown = moveQuizQuestion.bind(null, quiz.id, q.id, "down");
              return (
                <li key={q.id} className="sa-qd-question">
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
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-semibold">
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
      </div>

      {/* ---------------- Rarely-used settings, collapsed so the page matches the design ---------------- */}
      <details className="sa-qd-settings mt-6" open={detailsError || search?.error === "subject"}>
        <summary>Quiz settings (title &amp; subject)</summary>
        <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
          <form action={updateDetails} className="flex flex-col gap-3">
            <label className="sa-pg-field">
              Title
              <input name="title" required maxLength={120} defaultValue={quiz.title} className="sa-pg-input" />
            </label>
            {detailsError && <p className="text-sm font-medium text-rahoot-red">Please enter a title.</p>}
            <button type="submit" className="sa-qd-outline self-start">
              Save details
            </button>
          </form>
          <form action={changeSubject} className="flex flex-col gap-3">
            <label className="sa-pg-field">
              Subject
              <select name="subjectId" required defaultValue={quiz.subjectId ?? ""} className="sa-pg-input">
                <option value="" disabled>
                  Choose a subject&hellip;
                </option>
                {subjects.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-rahoot-muted">Changing the subject clears the selected target groups.</p>
            <button type="submit" className="sa-qd-outline self-start">
              Change subject
            </button>
          </form>
        </div>
      </details>

      <form action={removeQuiz} className="mt-8">
        <DeleteQuizButton title={quiz.title} />
      </form>
    </section>
  );
}
