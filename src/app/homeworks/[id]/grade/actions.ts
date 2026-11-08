"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canManageHomework } from "@/lib/homework-auth";

export async function gradeAnswer(
  homeworkId: string,
  answerId: string,
  formData: FormData
) {
  if (!(await canManageHomework(homeworkId))) notFound();

  const verdict = String(formData.get("verdict") || "");
  if (verdict !== "correct" && verdict !== "incorrect") return;

  // The answer must belong to a question of THIS homework. Authorizing the
  // homework alone is not enough: a server action is an independently
  // invocable endpoint, so without this scoping a caller who legitimately
  // manages homework A (including an unregistered public creator, since
  // homework creation needs no account) could grade - and arbitrarily
  // re-score - any Answer row in the database.
  const answer = await prisma.answer.findFirst({
    where: { id: answerId, question: { homeworkId } },
    select: { id: true, question: { select: { points: true } } },
  });
  if (!answer) notFound();

  // Clamp to the question's own point value, not just >= 0. The grading form
  // already sets max={question.points}, but that is a client-side hint only.
  // Whole points only - the column is an Int.
  const raw = Number(formData.get("points"));
  const requested = Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 0;
  const points = Math.min(requested, answer.question.points);

  await prisma.answer.update({
    where: { id: answer.id },
    data: {
      isCorrect: verdict === "correct",
      pointsAwarded: verdict === "correct" ? points : 0,
      gradedAt: new Date(),
    },
  });

  revalidatePath(`/homeworks/${homeworkId}/grade`);
  revalidatePath(`/homeworks/${homeworkId}/leaderboard`);
}
