import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentStudent } from "@/lib/session";
import { getVisibleQuiz, getAttempt, remainingSeconds } from "@/lib/quiz";
import { prisma } from "@/lib/prisma";
import { submitQuizAttempt } from "../actions";
import { SubmitQuizButton } from "./SubmitQuizButton";

export default async function QuizReviewPage({ params }: PageProps<"/quiz/[id]/review">) {
  const { id } = await params;
  const student = (await getCurrentStudent())!;

  const quiz = await getVisibleQuiz(id);
  if (!quiz) notFound();

  const attempt = await getAttempt(student.id, id);
  if (!attempt) redirect(`/quiz/${id}`);
  if (attempt.status !== "IN_PROGRESS") redirect(`/quiz/${id}/result`);

  const answers = await prisma.attemptAnswer.findMany({ where: { attemptId: attempt.id } });
  const answerByQuestion = new Map(answers.map((a) => [a.questionId, a]));

  const action = submitQuizAttempt.bind(null, id);

  return (
    <div className="flex w-full flex-1 flex-col">
      <h1 className="text-2xl font-bold">Review your answers</h1>
      <p className="mt-1 text-sm text-rahoot-muted">
        You can still go back and change an answer, as long as that question&apos;s timer hasn&apos;t run out.
        Submitting is final - this quiz can only be taken once.
      </p>

      <ol className="mt-6 flex flex-col gap-2">
        {quiz.questions.map((question, index) => {
          const answer = answerByQuestion.get(question.id);
          const expired = answer ? remainingSeconds(answer.deadlineAt) <= 0 : false;
          const selectedText = answer?.selectedOptionId
            ? question.options.find((o) => o.id === answer.selectedOptionId)?.text
            : null;

          return (
            <li key={question.id} className="card flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold">
                  {index + 1}. {question.text}
                </p>
                <p className="mt-1 text-sm text-rahoot-muted">
                  {selectedText ? (
                    <>Your answer: {selectedText}</>
                  ) : expired ? (
                    <span className="text-rahoot-red">Time expired - not answered</span>
                  ) : (
                    <span className="text-rahoot-red">Not answered yet</span>
                  )}
                </p>
              </div>
              <Link href={`/quiz/${id}/q/${index}`} className="btn btn-outline shrink-0 !py-1.5 !px-3 text-sm">
                {expired ? "View" : "Change"}
              </Link>
            </li>
          );
        })}
      </ol>

      <form action={action} className="mt-8 self-center">
        <SubmitQuizButton />
      </form>
    </div>
  );
}
