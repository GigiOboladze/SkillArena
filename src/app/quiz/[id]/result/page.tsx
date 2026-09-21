import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentStudent } from "@/lib/session";
import { getVisibleQuiz, getAttempt, getCumulativeLeaderboard } from "@/lib/quiz";
import { prisma } from "@/lib/prisma";
import { CountUp } from "@/components/CountUp";

export default async function QuizResultPage({ params }: PageProps<"/quiz/[id]/result">) {
  const { id } = await params;
  const student = (await getCurrentStudent())!;

  const quiz = await getVisibleQuiz(id);
  if (!quiz) notFound();

  const attempt = await getAttempt(student.id, id);
  if (!attempt) redirect(`/quiz/${id}`);
  if (attempt.status === "IN_PROGRESS") redirect(`/quiz/${id}/q/0`);

  const answers = await prisma.attemptAnswer.findMany({ where: { attemptId: attempt.id } });
  const answerByQuestion = new Map(answers.map((a) => [a.questionId, a]));

  if (attempt.status === "FAILED") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <h1 className="text-3xl font-black text-rahoot-red">QUIZ FAILED</h1>
        <p className="mt-4 text-rahoot-muted">Reason</p>
        <p className="font-semibold">{attempt.failureReason ?? "Failed"}</p>
        <p className="mt-4 text-rahoot-muted">Detected switches</p>
        <p className="font-semibold">{attempt.tabSwitchCount}</p>
        <p className="mt-4 text-rahoot-muted">Score</p>
        <p className="text-2xl font-black">
          0 / {attempt.totalQuestions}
        </p>
        <Link href="/dashboard" className="btn btn-primary mt-8">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const leaderboard = student.programId ? await getCumulativeLeaderboard(student.programId) : [];
  const totalScore = leaderboard.find((e) => e.studentId === student.id)?.totalScore ?? attempt.score;

  return (
    <div className="flex w-full flex-1 flex-col">
      <div className="text-center">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-rahoot-muted">Quiz complete 🎉</p>
        <h1 className="mt-1 text-xl font-bold">{quiz.title}</h1>
        <p className="mt-3 text-5xl font-black text-rahoot-red">
          <CountUp value={attempt.score} /> / {attempt.totalQuestions}
        </p>
        <p className="mt-3 text-sm text-rahoot-muted">
          +{attempt.score} point{attempt.score === 1 ? "" : "s"} added to your SkillArena score
        </p>
        <div className="card mx-auto mt-4 inline-flex flex-col px-6 py-3">
          <span className="text-xs uppercase tracking-wide text-rahoot-muted">Current total</span>
          <span className="text-2xl font-black text-skillarena-accent">
            <CountUp value={totalScore} /> points
          </span>
        </div>
      </div>

      <ol className="mt-8 flex flex-col gap-2">
        {quiz.questions.map((question, index) => {
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
              <p className="mt-2 text-sm text-rahoot-muted">
                Your answer: {selectedOption?.text ?? "Not answered"}
              </p>
              {!answer?.isCorrect && (
                <p className="text-sm text-rahoot-muted">Correct answer: {correctOption?.text}</p>
              )}
            </li>
          );
        })}
      </ol>

      <Link href="/dashboard" className="btn btn-primary mt-8 self-center">
        Back to dashboard
      </Link>
    </div>
  );
}
