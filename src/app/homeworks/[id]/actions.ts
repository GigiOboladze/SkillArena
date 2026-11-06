"use server";

import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canManageHomework } from "@/lib/homework-auth";
import { getAdminSession } from "@/lib/session";
import type { HomeworkStatus, QuestionType } from "@/generated/prisma/client";

// Doesn't redirect to /admin/login - unlike admin auth, failing this check
// doesn't mean "you're not logged in as admin", it means "this isn't your
// homework" (a public creator's cookie not matching, or no cookie at all).
// notFound() is the honest response either way.
async function requireManage(homeworkId: string) {
  if (!(await canManageHomework(homeworkId))) notFound();
}

/**
 * Verifies the question actually belongs to the homework the caller was just
 * authorized for. Authorizing the parent homework is NOT enough on its own: a
 * server action is an independently invocable endpoint, so without this check a
 * caller who legitimately manages homework A - including an unregistered public
 * creator, since homework creation needs no account - could pass any OTHER
 * homework's questionId and have it edited or deleted under A's authority.
 * `Question` is shared by LIVE/ASYNC/QUIZ homeworks, so that reached SkillArena
 * quiz questions too. Mirrors the scoping `submitAsyncAnswer` already does.
 */
async function requireQuestionInHomework(homeworkId: string, questionId: string) {
  const question = await prisma.question.findFirst({
    where: { id: questionId, homeworkId },
    select: { id: true },
  });
  if (!question) notFound();
  return question;
}

export async function updateHomeworkDetails(
  homeworkId: string,
  formData: FormData
) {
  await requireManage(homeworkId);
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  if (!title) redirect(`/homeworks/${homeworkId}?error=title`);

  await prisma.homework.update({
    where: { id: homeworkId },
    data: { title, description: description || null },
  });
  revalidatePath(`/homeworks/${homeworkId}`);
  redirect(`/homeworks/${homeworkId}`);
}

const VALID_STATUSES: HomeworkStatus[] = ["DRAFT", "OPEN", "CLOSED"];

export async function setHomeworkStatus(homeworkId: string, status: string) {
  await requireManage(homeworkId);
  if (!VALID_STATUSES.includes(status as HomeworkStatus)) return;

  await prisma.homework.update({
    where: { id: homeworkId },
    data: { status: status as HomeworkStatus },
  });
  revalidatePath(`/homeworks/${homeworkId}`);
  revalidatePath("/admin");
}

export async function deleteHomework(homeworkId: string) {
  await requireManage(homeworkId);
  const isAdmin = !!(await getAdminSession());
  await prisma.homework.delete({ where: { id: homeworkId } });
  revalidatePath("/admin");
  revalidatePath("/my-homeworks");
  redirect(isAdmin ? "/admin" : "/my-homeworks");
}

type QuestionFormValues = {
  text: string;
  type: QuestionType;
  points: number;
  timeLimitSec: number;
  options: { text: string; isCorrect: boolean }[];
};

function parseQuestionForm(formData: FormData): QuestionFormValues | { error: string } {
  const text = String(formData.get("text") || "").trim();
  const type = String(formData.get("type") || "MULTIPLE_CHOICE") as QuestionType;
  const points = Math.max(1, Number(formData.get("points")) || 1000);
  const timeLimitSec = Math.max(5, Number(formData.get("timeLimitSec")) || 20);

  if (!text) return { error: "text" };

  if (type === "PARAGRAPH") {
    return { text, type, points, timeLimitSec, options: [] };
  }

  const correctIndex = Number(formData.get("correct"));
  const rawOptions = [1, 2, 3, 4].map((i) =>
    String(formData.get(`opt${i}`) || "").trim()
  );
  const options = rawOptions
    .map((optText, i) => ({ text: optText, isCorrect: i + 1 === correctIndex }))
    .filter((o) => o.text.length > 0);

  if (options.length < 2) return { error: "options" };
  if (!options.some((o) => o.isCorrect)) return { error: "correct" };

  return { text, type: "MULTIPLE_CHOICE", points, timeLimitSec, options };
}

export async function createQuestion(homeworkId: string, formData: FormData) {
  await requireManage(homeworkId);
  const parsed = parseQuestionForm(formData);
  if ("error" in parsed) {
    redirect(`/homeworks/${homeworkId}/questions/new?error=${parsed.error}`);
  }

  // max(order)+1, not count(): deleting a question in the middle leaves a gap
  // without renumbering the survivors, so count() would reuse an existing
  // order and silently produce two questions with the same position.
  const last = await prisma.question.findFirst({
    where: { homeworkId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const order = last ? last.order + 1 : 0;

  await prisma.question.create({
    data: {
      homeworkId,
      order,
      text: parsed.text,
      type: parsed.type,
      points: parsed.points,
      timeLimitSec: parsed.timeLimitSec,
      options: {
        create: parsed.options.map((o, i) => ({
          text: o.text,
          isCorrect: o.isCorrect,
          order: i,
        })),
      },
    },
  });

  revalidatePath(`/homeworks/${homeworkId}`);
  redirect(`/homeworks/${homeworkId}`);
}

export async function updateQuestion(
  homeworkId: string,
  questionId: string,
  formData: FormData
) {
  await requireManage(homeworkId);
  await requireQuestionInHomework(homeworkId, questionId);
  const parsed = parseQuestionForm(formData);
  if ("error" in parsed) {
    redirect(
      `/homeworks/${homeworkId}/questions/${questionId}/edit?error=${parsed.error}`
    );
  }

  await prisma.$transaction([
    prisma.option.deleteMany({ where: { questionId } }),
    prisma.question.update({
      where: { id: questionId },
      data: {
        text: parsed.text,
        type: parsed.type,
        points: parsed.points,
        timeLimitSec: parsed.timeLimitSec,
        options: {
          create: parsed.options.map((o, i) => ({
            text: o.text,
            isCorrect: o.isCorrect,
            order: i,
          })),
        },
      },
    }),
  ]);

  revalidatePath(`/homeworks/${homeworkId}`);
  redirect(`/homeworks/${homeworkId}`);
}

export async function deleteQuestion(homeworkId: string, questionId: string) {
  await requireManage(homeworkId);
  await requireQuestionInHomework(homeworkId, questionId);
  await prisma.question.delete({ where: { id: questionId } });
  revalidatePath(`/homeworks/${homeworkId}`);
  redirect(`/homeworks/${homeworkId}`);
}
