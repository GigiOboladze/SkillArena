import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentStudent } from "@/lib/session";
import { getVisibleQuiz, getAttempt, getOrCreateAttemptAnswer, remainingSeconds } from "@/lib/quiz";
import { selectAnswer } from "../../actions";
import { QuestionClientControls } from "./QuestionClientControls";

export default async function QuizQuestionPage({
  params,
}: PageProps<"/quiz/[id]/q/[index]">) {
  const { id, index: indexParam } = await params;
  const index = Number(indexParam);

  const student = (await getCurrentStudent())!;
  const quiz = await getVisibleQuiz(id);
  if (!quiz) notFound();

  const attempt = await getAttempt(student.id, id);
  if (!attempt) redirect(`/quiz/${id}`);
  if (attempt.status !== "IN_PROGRESS") redirect(`/quiz/${id}/result`);

  const total = quiz.questions.length;
  if (!Number.isInteger(index) || index < 0 || index >= total) {
    redirect(`/quiz/${id}`);
  }

  const question = quiz.questions[index];
  const attemptAnswer = await getOrCreateAttemptAnswer(attempt.id, question.id);
  const remaining = remainingSeconds(attemptAnswer.deadlineAt);
  const expired = remaining <= 0;

  const isLast = index === total - 1;
  const nextHref = isLast ? `/quiz/${id}/review` : `/quiz/${id}/q/${index + 1}`;

  return (
    <div className="flex w-full flex-1 flex-col">
      <p className="text-center text-sm font-bold uppercase tracking-wide text-rahoot-red">
        Question {index + 1} of {total}
      </p>

      <div className="mt-4">
        <QuestionClientControls
          quizId={id}
          initialRemainingSeconds={remaining}
          expired={expired}
          nextHref={nextHref}
          tabSwitchCount={attempt.tabSwitchCount}
        />
      </div>

      <h1 className="mt-6 text-center text-xl font-bold">{question.text}</h1>

      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {question.options.map((option) => {
          const selected = attemptAnswer.selectedOptionId === option.id;
          const action = selectAnswer.bind(null, id, question.id, option.id);
          return (
            <form action={action} key={option.id}>
              <button
                type="submit"
                disabled={expired}
                aria-pressed={selected}
                className={`flex min-h-16 w-full items-center justify-center rounded-2xl border-2 p-4 text-center font-bold transition-all duration-150 ease-out sm:min-h-20 ${
                  selected
                    ? "border-rahoot-red bg-rahoot-red text-[color:var(--on-primary)] shadow-lg"
                    : "border-rahoot-red bg-rahoot-surface text-rahoot-red"
                } ${expired ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:bg-rahoot-red-light active:scale-95"}`}
              >
                <span className="text-sm leading-snug sm:text-base">{option.text}</span>
              </button>
            </form>
          );
        })}
      </div>

      {expired && (
        <p className="mt-4 text-center text-sm font-medium text-rahoot-red">
          Time&apos;s up for this question - it&apos;s locked in.
        </p>
      )}

      <div className="mt-8 flex items-center justify-between">
        {index > 0 ? (
          <Link href={`/quiz/${id}/q/${index - 1}`} className="btn btn-outline">
            Previous
          </Link>
        ) : (
          <span />
        )}
        <Link href={nextHref} className="btn btn-primary">
          {isLast ? "Review answers" : "Next"}
        </Link>
      </div>
    </div>
  );
}
