"use server";

import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStudentForHomework } from "@/lib/student-session";
import { computeMultipleChoicePoints } from "@/lib/scoring";

export async function submitAsyncAnswer(
  homeworkId: string,
  questionId: string,
  index: number,
  total: number,
  formData: FormData
) {
  const student = await getStudentForHomework(homeworkId);
  if (!student) redirect("/join");
  if (student.finishedAt) redirect(`/play/${homeworkId}/done`);

  // homeworkId/questionId/index/total arrive as bound arguments, which the
  // client can alter - only the student cookie and this lookup are trusted.
  const question = await prisma.question.findFirst({
    where: { id: questionId, homeworkId, homework: { mode: "ASYNC" } },
    include: { options: true, homework: { select: { status: true } } },
  });
  if (!question) notFound();
  // Closing the homework stops submissions too, not just new joins - a page
  // left open from before the teacher closed it must not keep scoring.
  if (question.homework.status !== "OPEN") redirect(`/play/${homeworkId}/done`);

  const requestedOptionId = String(formData.get("optionId") || "");
  const textAnswer =
    question.type === "PARAGRAPH"
      ? String(formData.get("textAnswer") || "").slice(0, 5000) || null
      : null;

  let isCorrect: boolean | null = null;
  let pointsAwarded = 0;
  let selectedOptionId: string | null = null;
  if (question.type === "MULTIPLE_CHOICE") {
    // Only ever store an option of THIS question (a forged id from another
    // question used to be saved as-is).
    const opt = question.options.find((o) => o.id === requestedOptionId);
    selectedOptionId = opt?.id ?? null;
    isCorrect = !!opt?.isCorrect;
    pointsAwarded = computeMultipleChoicePoints({
      isCorrect,
      basePoints: question.points,
      mode: "ASYNC",
      elapsedMs: 0,
      timeLimitSec: question.timeLimitSec,
    });
  }

  await prisma.answer.upsert({
    where: { studentId_questionId: { studentId: student.id, questionId } },
    create: {
      studentId: student.id,
      questionId,
      selectedOptionId,
      textAnswer,
      isCorrect,
      pointsAwarded,
    },
    update: { selectedOptionId, textAnswer, isCorrect, pointsAwarded },
  });

  const nextIndex = index + 1;
  if (nextIndex >= total) {
    await prisma.student.update({
      where: { id: student.id },
      data: { finishedAt: student.finishedAt ?? new Date() },
    });
    redirect(`/play/${homeworkId}/done`);
  } else {
    redirect(`/play/${homeworkId}/q/${nextIndex}`);
  }
}
