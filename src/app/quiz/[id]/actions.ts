"use server";

import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentStudent } from "@/lib/session";
import {
  getVisibleQuiz,
  getAttempt,
  startOrGetAttempt,
  getOrCreateAttemptAnswer,
  QUIZ_QUESTION_POINTS,
  QUIZ_MAX_TAB_SWITCHES,
  QUIZ_TAB_SWITCH_FAILURE_REASON,
} from "@/lib/quiz";
import { isStudentEligibleForQuiz } from "@/lib/subjects";

async function requireStudent() {
  const student = await getCurrentStudent();
  if (!student) redirect("/login");
  return student;
}

/** Loads the quiz + the student's own attempt, verifying the attempt is genuinely theirs and still IN_PROGRESS. */
async function requireActiveAttempt(quizId: string) {
  const student = await requireStudent();
  const attempt = await getAttempt(student.id, quizId);
  if (!attempt) redirect(`/quiz/${quizId}`);
  if (attempt.status !== "IN_PROGRESS") redirect(`/quiz/${quizId}/result`);
  return { student, attempt };
}

export async function startQuiz(quizId: string) {
  const student = await requireStudent();
  const quiz = await getVisibleQuiz(quizId);
  if (!quiz || quiz.status !== "OPEN") notFound();

  const existing = await getAttempt(student.id, quizId);
  if (existing) {
    redirect(existing.status === "IN_PROGRESS" ? `/quiz/${quizId}/q/0` : `/quiz/${quizId}/result`);
  }

  // Re-verified here, not just at the dashboard listing - a student must not
  // be able to start a quiz outside their subject/group eligibility just by
  // knowing (or guessing) its URL.
  const eligible = await isStudentEligibleForQuiz(student.id, quizId, quiz.subjectId);
  if (!eligible) notFound();

  await startOrGetAttempt(student.id, quizId, quiz.questions.length);
  redirect(`/quiz/${quizId}/q/0`);
}

export async function selectAnswer(quizId: string, questionId: string, optionId: string, formData: FormData) {
  void formData;
  const { attempt } = await requireActiveAttempt(quizId);

  // Both ids must really belong to this quiz. A server action is an
  // independently invocable endpoint, so neither can be taken on trust:
  // without this, a client could create AttemptAnswer rows pointing at other
  // quizzes' questions (starting their 100s clocks), and a non-existent
  // optionId would reach the database as a foreign-key violation and surface
  // as an unhandled 500. Not score-exploitable either way - submitQuizAttempt
  // grades against each question's own correct option - but neither value has
  // any business being written unvalidated.
  const question = await prisma.question.findFirst({
    where: { id: questionId, homeworkId: quizId },
    select: { id: true, options: { where: { id: optionId }, select: { id: true } } },
  });
  if (!question || question.options.length === 0) notFound();

  const row = await getOrCreateAttemptAnswer(attempt.id, questionId);
  if (Date.now() < row.deadlineAt.getTime()) {
    await prisma.attemptAnswer.update({
      where: { id: row.id },
      data: { selectedOptionId: optionId, answeredAt: new Date() },
    });
  }
  // Past the deadline, the selection is silently ignored - the question is locked.

  revalidatePath(`/quiz/${quizId}/q`);
}

/**
 * Reports a detected tab/window/focus switch. Server-authoritative: the
 * count and the failure decision both live here, never trusted from the
 * client. Returns the fresh count so the client can update its banner.
 */
export async function reportTabSwitch(quizId: string): Promise<{ tabSwitchCount: number; failed: boolean }> {
  const student = await requireStudent();
  const attempt = await getAttempt(student.id, quizId);
  if (!attempt || attempt.status !== "IN_PROGRESS") {
    return { tabSwitchCount: attempt?.tabSwitchCount ?? 0, failed: attempt?.status === "FAILED" };
  }

  const updated = await prisma.quizAttempt.update({
    where: { id: attempt.id },
    data: { tabSwitchCount: { increment: 1 }, events: { create: { type: "TAB_HIDDEN" } } },
  });

  if (updated.tabSwitchCount > QUIZ_MAX_TAB_SWITCHES) {
    await prisma.quizAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "FAILED",
        score: 0,
        failureReason: QUIZ_TAB_SWITCH_FAILURE_REASON,
        completedAt: new Date(),
        events: { create: { type: "FAILED" } },
      },
    });
    revalidatePath("/dashboard");
    return { tabSwitchCount: updated.tabSwitchCount, failed: true };
  }

  return { tabSwitchCount: updated.tabSwitchCount, failed: false };
}

export async function submitQuizAttempt(quizId: string) {
  const { attempt } = await requireActiveAttempt(quizId);

  const quiz = await getVisibleQuiz(quizId);
  if (!quiz) notFound();

  const answers = await prisma.attemptAnswer.findMany({ where: { attemptId: attempt.id } });
  const answerByQuestion = new Map(answers.map((a) => [a.questionId, a]));

  let score = 0;
  const updates = [];
  for (const question of quiz.questions) {
    const correctOption = question.options.find((o) => o.isCorrect);
    const answer = answerByQuestion.get(question.id);
    const isCorrect = !!answer?.selectedOptionId && answer.selectedOptionId === correctOption?.id;
    // Uses the shared constant rather than a literal 1. The value is the same,
    // but quiz-constants.ts presents itself as the quiz rule configuration, so
    // a hardcoded literal here meant editing QUIZ_QUESTION_POINTS silently
    // changed nothing - a trap for whoever tunes the rules next.
    if (isCorrect) score += QUIZ_QUESTION_POINTS;
    if (answer) {
      updates.push(prisma.attemptAnswer.update({ where: { id: answer.id }, data: { isCorrect } }));
    }
  }

  // `totalQuestions` was snapshotted when the attempt started, but the score
  // above is computed against the quiz's CURRENT questions - and an admin can
  // add or remove questions on a published quiz. Re-stamping it here keeps the
  // stored pair self-consistent, so the result page and dashboard can never
  // render an impossible score like "5 / 3".
  const totalQuestions = quiz.questions.length;

  await prisma.$transaction([
    ...updates,
    prisma.quizAttempt.update({
      where: { id: attempt.id },
      data: { status: "COMPLETED", score, totalQuestions, completedAt: new Date() },
    }),
  ]);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leaderboard");
  redirect(`/quiz/${quizId}/result`);
}
