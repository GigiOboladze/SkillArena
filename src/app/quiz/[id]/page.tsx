import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentStudent } from "@/lib/session";
import { getVisibleQuiz, getAttempt, QUIZ_QUESTION_TIME_LIMIT_SEC, QUIZ_MAX_TAB_SWITCHES } from "@/lib/quiz";
import { isStudentEligibleForQuiz } from "@/lib/subjects";
import { startQuiz } from "./actions";
import { Logo } from "@/components/Logo";

export default async function QuizStartPage({ params }: PageProps<"/quiz/[id]">) {
  const { id } = await params;
  const student = (await getCurrentStudent())!;

  const quiz = await getVisibleQuiz(id);
  if (!quiz || quiz.status !== "OPEN") notFound();

  const attempt = await getAttempt(student.id, id);

  // A student who never had an attempt must currently be eligible to even
  // learn this quiz exists. One who already has an attempt (started while
  // eligible, possibly reassigned since) keeps access to their own result.
  if (!attempt) {
    const eligible = await isStudentEligibleForQuiz(student.id, id, quiz.subjectId);
    if (!eligible) notFound();
  }

  if (attempt && attempt.status !== "IN_PROGRESS") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <h1 className="text-2xl font-bold">{quiz.title}</h1>
        <p className="mt-3 text-rahoot-muted">
          You&apos;ve already completed this quiz. Each quiz can only be taken once.
        </p>
        <Link href={`/quiz/${id}/result`} className="btn btn-primary mt-6">
          View your result
        </Link>
      </div>
    );
  }

  const action = startQuiz.bind(null, id);
  const total = quiz.questions.length;

  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <Logo size={36} variant="mark" />
      <p className="mt-5 text-sm font-bold uppercase tracking-[0.2em] text-rahoot-muted">{quiz.title}</p>
      <h1 className="mt-2 text-3xl font-black uppercase tracking-tight">Ready for the arena?</h1>

      <ul className="card mt-6 flex w-full max-w-sm flex-col gap-3 p-6 text-left text-sm">
        <li className="flex items-center justify-between">
          <span className="text-rahoot-muted">Questions</span>
          <strong>{total}</strong>
        </li>
        <li className="flex items-center justify-between">
          <span className="text-rahoot-muted">Possible points</span>
          <strong>{total}</strong>
        </li>
        <li className="flex items-center justify-between">
          <span className="text-rahoot-muted">Time per question</span>
          <strong>{QUIZ_QUESTION_TIME_LIMIT_SEC} seconds</strong>
        </li>
        <li className="flex items-center justify-between border-t border-rahoot-border pt-3 text-rahoot-red">
          <span>⚠️ {QUIZ_MAX_TAB_SWITCHES + 1} tab switches</span>
          <strong>Automatic failure</strong>
        </li>
      </ul>

      <p className="mt-4 max-w-sm text-xs text-rahoot-muted">
        You can move between questions and change answers before you submit. Once submitted, this quiz is final and
        cannot be retaken.
      </p>

      <form action={action} className="mt-6">
        <button type="submit" className="btn btn-primary px-8">
          {attempt ? "Resume quiz" : "Enter Arena"}
        </button>
      </form>
    </div>
  );
}
