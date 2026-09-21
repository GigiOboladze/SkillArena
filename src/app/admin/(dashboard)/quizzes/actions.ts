"use server";

import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/session";
import { generateJoinCode } from "@/lib/tokens";
import type { HomeworkStatus, User } from "@/generated/prisma/client";

async function requireAdmin(): Promise<User> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

/**
 * Loads the quiz and verifies this admin may manage it - a regular Admin
 * only for a quiz belonging to their own program (via the quiz's subject),
 * the Super Admin for any quiz. Every mutation below goes through this
 * rather than trusting the admin dashboard's own list filtering - hiding
 * another program's quizzes from a list is not what makes this safe.
 */
async function requireQuizAccess(admin: User, quizId: string) {
  const quiz = await prisma.homework.findFirst({
    where: { id: quizId, mode: "QUIZ" },
    include: { subject: true },
  });
  if (!quiz) notFound();
  if (admin.role !== "SUPER_ADMIN" && quiz.subject?.programId !== admin.programId) notFound();
  return quiz;
}

export async function createQuiz(programId: string, formData: FormData) {
  const admin = await requireAdmin();
  if (admin.role !== "SUPER_ADMIN" && programId !== admin.programId) {
    redirect("/admin/quizzes/new?error=subject");
  }

  const title = String(formData.get("title") || "").trim();
  const subjectId = String(formData.get("subjectId") || "").trim();
  if (!title) redirect(`/admin/quizzes/new?program=${programId}&error=title`);
  if (!subjectId) redirect(`/admin/quizzes/new?program=${programId}&error=subject`);

  // The subject must be real AND belong to the program this quiz is being
  // created under - never trust the submitted subjectId alone.
  const subject = await prisma.subject.findFirst({ where: { id: subjectId, programId } });
  if (!subject) redirect(`/admin/quizzes/new?program=${programId}&error=subject`);

  let joinCode = generateJoinCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await prisma.homework.findUnique({ where: { joinCode } });
    if (!clash) break;
    joinCode = generateJoinCode();
  }

  const quiz = await prisma.homework.create({
    data: { title, mode: "QUIZ", joinCode, ownerUserId: admin.id, subjectId },
  });

  revalidatePath("/admin/quizzes");
  redirect(`/admin/quizzes/${quiz.id}`);
}

/** Replaces the quiz's subject and its full set of target groups in one go - simpler and safer than diffing which checkboxes changed. */
export async function updateQuizTargeting(quizId: string, formData: FormData) {
  const admin = await requireAdmin();
  const quiz = await requireQuizAccess(admin, quizId);

  const subjectId = String(formData.get("subjectId") || "").trim();
  if (!subjectId) redirect(`/admin/quizzes/${quizId}?error=subject`);

  // A quiz's program is fixed at creation (via its first subject) and never
  // changes - retargeting to a different subject is only allowed within
  // that same program, never as a back door to move a quiz between programs.
  const currentProgramId = quiz.subject?.programId;
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, programId: currentProgramId },
    include: { groups: true },
  });
  if (!subject) redirect(`/admin/quizzes/${quizId}?error=subject`);

  const validGroupIds = new Set(subject.groups.map((g) => g.id));
  const selectedGroupIds = formData
    .getAll("groupIds")
    .map(String)
    .filter((id) => validGroupIds.has(id));

  await prisma.$transaction([
    prisma.homework.update({ where: { id: quizId }, data: { subjectId } }),
    prisma.quizTargetGroup.deleteMany({ where: { homeworkId: quizId } }),
    prisma.quizTargetGroup.createMany({
      data: selectedGroupIds.map((groupId) => ({ homeworkId: quizId, groupId })),
    }),
  ]);

  revalidatePath(`/admin/quizzes/${quizId}`);
  revalidatePath("/admin/quizzes");
  redirect(`/admin/quizzes/${quizId}`);
}

export async function updateQuizDetails(quizId: string, formData: FormData) {
  const admin = await requireAdmin();
  await requireQuizAccess(admin, quizId);
  const title = String(formData.get("title") || "").trim();
  if (!title) redirect(`/admin/quizzes/${quizId}?error=title`);

  await prisma.homework.update({ where: { id: quizId }, data: { title } });
  revalidatePath(`/admin/quizzes/${quizId}`);
  revalidatePath("/admin/quizzes");
  redirect(`/admin/quizzes/${quizId}`);
}

const VALID_STATUSES: HomeworkStatus[] = ["DRAFT", "OPEN", "CLOSED"];

export async function setQuizStatus(quizId: string, status: string) {
  const admin = await requireAdmin();
  const quiz = await requireQuizAccess(admin, quizId);
  if (!VALID_STATUSES.includes(status as HomeworkStatus)) return;

  if (status === "OPEN") {
    const [targetGroupCount, questionCount] = await Promise.all([
      prisma.quizTargetGroup.count({ where: { homeworkId: quizId } }),
      prisma.question.count({ where: { homeworkId: quizId } }),
    ]);
    // A published quiz with zero questions traps any student who starts it:
    // startQuiz creates their one-and-only attempt, but the question page
    // (index 0 >= total 0) immediately redirects back to the start screen,
    // which now offers "Resume quiz" - clicking it repeats the same loop
    // forever, with no way to ever submit or complete that attempt.
    if (!quiz.subjectId || targetGroupCount === 0 || questionCount === 0) {
      redirect(`/admin/quizzes/${quizId}?error=publish`);
    }
  }

  await prisma.homework.update({ where: { id: quizId }, data: { status: status as HomeworkStatus } });
  revalidatePath(`/admin/quizzes/${quizId}`);
  revalidatePath("/admin/quizzes");
  revalidatePath("/dashboard");
}

export async function deleteQuiz(quizId: string) {
  const admin = await requireAdmin();
  await requireQuizAccess(admin, quizId);
  await prisma.homework.delete({ where: { id: quizId } });
  revalidatePath("/admin/quizzes");
  redirect("/admin/quizzes");
}

function parseQuizQuestionForm(formData: FormData) {
  const text = String(formData.get("text") || "").trim();
  if (!text) return { error: "text" as const };

  const correctIndex = Number(formData.get("correct"));
  const options = [1, 2, 3, 4].map((i) => String(formData.get(`opt${i}`) || "").trim());

  if (options.some((o) => o.length === 0)) return { error: "options" as const };
  if (!(correctIndex >= 1 && correctIndex <= 4)) return { error: "correct" as const };

  return {
    text,
    options: options.map((optText, i) => ({ text: optText, isCorrect: i + 1 === correctIndex })),
  };
}

export async function createQuizQuestion(quizId: string, formData: FormData) {
  const admin = await requireAdmin();
  await requireQuizAccess(admin, quizId);
  const parsed = parseQuizQuestionForm(formData);
  if ("error" in parsed) {
    redirect(`/admin/quizzes/${quizId}/questions/new?error=${parsed.error}`);
  }

  const count = await prisma.question.count({ where: { homeworkId: quizId } });

  await prisma.question.create({
    data: {
      homeworkId: quizId,
      order: count,
      type: "MULTIPLE_CHOICE",
      text: parsed.text,
      points: 1,
      timeLimitSec: 100,
      options: { create: parsed.options.map((o, i) => ({ text: o.text, isCorrect: o.isCorrect, order: i })) },
    },
  });

  revalidatePath(`/admin/quizzes/${quizId}`);
  redirect(`/admin/quizzes/${quizId}`);
}

export async function updateQuizQuestion(quizId: string, questionId: string, formData: FormData) {
  const admin = await requireAdmin();
  await requireQuizAccess(admin, quizId);
  const parsed = parseQuizQuestionForm(formData);
  if ("error" in parsed) {
    redirect(`/admin/quizzes/${quizId}/questions/${questionId}/edit?error=${parsed.error}`);
  }

  await prisma.$transaction([
    prisma.option.deleteMany({ where: { questionId } }),
    prisma.question.update({
      where: { id: questionId },
      data: {
        text: parsed.text,
        options: { create: parsed.options.map((o, i) => ({ text: o.text, isCorrect: o.isCorrect, order: i })) },
      },
    }),
  ]);

  revalidatePath(`/admin/quizzes/${quizId}`);
  redirect(`/admin/quizzes/${quizId}`);
}

export async function deleteQuizQuestion(quizId: string, questionId: string) {
  const admin = await requireAdmin();
  const quiz = await requireQuizAccess(admin, quizId);

  // A published (OPEN) quiz must never drop to zero questions - see the
  // matching check in setQuizStatus for why: a student who starts a
  // zero-question quiz gets permanently stuck (their one attempt is created
  // but can never be completed).
  if (quiz.status === "OPEN") {
    const remaining = await prisma.question.count({ where: { homeworkId: quizId } });
    if (remaining <= 1) {
      redirect(`/admin/quizzes/${quizId}?error=lastquestion`);
    }
  }

  await prisma.question.delete({ where: { id: questionId } });
  revalidatePath(`/admin/quizzes/${quizId}`);
  redirect(`/admin/quizzes/${quizId}`);
}

/** Swaps this question's `order` with its immediate neighbor - the only way to reorder, so the admin always knows the exact resulting order. */
export async function moveQuizQuestion(quizId: string, questionId: string, direction: "up" | "down") {
  const admin = await requireAdmin();
  await requireQuizAccess(admin, quizId);

  const questions = await prisma.question.findMany({
    where: { homeworkId: quizId },
    orderBy: { order: "asc" },
  });
  const index = questions.findIndex((q) => q.id === questionId);
  if (index === -1) return;

  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= questions.length) return;

  const a = questions[index];
  const b = questions[swapWith];

  await prisma.$transaction([
    prisma.question.update({ where: { id: a.id }, data: { order: b.order } }),
    prisma.question.update({ where: { id: b.id }, data: { order: a.order } }),
  ]);

  revalidatePath(`/admin/quizzes/${quizId}`);
}
