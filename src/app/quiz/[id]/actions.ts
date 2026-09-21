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
    if (isCorrect) score += 1;
    if (answer) {
      updates.push(prisma.attemptAnswer.update({ where: { id: answer.id }, data: { isCorrect } }));
    }
  }

  await prisma.$transaction([
    ...updates,
    prisma.quizAttempt.update({
      where: { id: attempt.id },
      data: { status: "COMPLETED", score, completedAt: new Date() },
    }),
  ]);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leaderboard");
  redirect(`/quiz/${quizId}/result`);
}
