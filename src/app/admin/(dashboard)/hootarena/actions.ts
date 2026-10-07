"use server";

import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/session";
import { generateUniqueHootPin } from "@/lib/hootarena/pin";
import { loadHootGameForAdmin } from "@/lib/hootarena/access";
import type { HootQuestionType, User } from "@/generated/prisma/client";

async function requireAdmin(): Promise<User> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

/** Loads the game and verifies this admin may manage it (see loadHootGameForAdmin - same ownership model as requireQuizAccess). */
async function requireHootGameAccess(admin: User, gameId: string) {
  const game = await loadHootGameForAdmin(admin, gameId);
  if (!game) notFound();
  return game;
}

/**
 * Editing (targeting, questions, deletion) is only allowed while the game is
 * still in LOBBY - once it has started, its question set and target
 * audience are locked in for everyone already in the room, matching the
 * spec's "no HootArena history/editing surface, just the active game
 * lifecycle" framing.
 */
function requireHootGameEditable(game: { status: string }, redirectTo: string) {
  if (game.status !== "LOBBY") redirect(redirectTo);
}

/**
 * A HootArena game has no program/subject/group targeting at all - it's
 * joinable by PIN/QR alone, by anyone the host shares it with (no
 * SkillArena account needed to play). So creation only ever needs a title.
 */
export async function createHootGame(formData: FormData) {
  const admin = await requireAdmin();

  const title = String(formData.get("title") || "").trim();
  if (!title) redirect("/admin/hootarena/new?error=title");

  const pin = await generateUniqueHootPin();

  const game = await prisma.hootGame.create({
    data: { title, pin, hostId: admin.id },
  });

  revalidatePath("/admin/hootarena");
  redirect(`/admin/hootarena/${game.id}`);
}

export async function updateHootGameDetails(gameId: string, formData: FormData) {
  const admin = await requireAdmin();
  const game = await requireHootGameAccess(admin, gameId);
  requireHootGameEditable(game, `/admin/hootarena/${gameId}`);

  const title = String(formData.get("title") || "").trim();
  if (!title) redirect(`/admin/hootarena/${gameId}?error=title`);

  await prisma.hootGame.update({ where: { id: gameId }, data: { title } });
  revalidatePath(`/admin/hootarena/${gameId}`);
  revalidatePath("/admin/hootarena");
  redirect(`/admin/hootarena/${gameId}`);
}

export async function deleteHootGame(gameId: string) {
  const admin = await requireAdmin();
  const game = await requireHootGameAccess(admin, gameId);
  requireHootGameEditable(game, `/admin/hootarena/${gameId}`);

  await prisma.hootGame.delete({ where: { id: gameId } });
  revalidatePath("/admin/hootarena");
  redirect("/admin/hootarena");
}

const VALID_TYPES: HootQuestionType[] = ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE"];
const MAX_OPTIONS = 6;

/**
 * Parses a question form shared by all three question types. Every option
 * input is named opt1..opt6 (blanks ignored), and "correct" is submitted as
 * one or more 1-based option indices - a radio group for SINGLE_CHOICE/
 * TRUE_FALSE, checkboxes for MULTIPLE_CHOICE - so FormData.getAll("correct")
 * reads uniformly across all three regardless of the input type that
 * produced it. TRUE_FALSE ignores the opt1..opt6 fields entirely and always
 * creates exactly two fixed options (True/False).
 */
function parseHootQuestionForm(
  formData: FormData
):
  | { error: "text" | "type" | "options" | "correct" }
  | { type: HootQuestionType; text: string; options: { text: string; isCorrect: boolean }[] } {
  const text = String(formData.get("text") || "").trim();
  if (!text) return { error: "text" };

  const type = String(formData.get("type") || "");
  if (!VALID_TYPES.includes(type as HootQuestionType)) return { error: "type" };

  const correctIndices = new Set(formData.getAll("correct").map(String));

  if (type === "TRUE_FALSE") {
    const trueSelected = correctIndices.has("1");
    const falseSelected = correctIndices.has("2");
    if (trueSelected === falseSelected) return { error: "correct" }; // exactly one, never both/neither
    return {
      type: "TRUE_FALSE",
      text,
      options: [
        { text: "True", isCorrect: trueSelected },
        { text: "False", isCorrect: falseSelected },
      ],
    };
  }

  const filled = Array.from({ length: MAX_OPTIONS }, (_, i) => i + 1)
    .map((index) => ({ index, text: String(formData.get(`opt${index}`) || "").trim() }))
    .filter((o) => o.text.length > 0);
  if (filled.length < 2) return { error: "options" };

  const filledIndexSet = new Set(filled.map((o) => o.index));
  for (const idx of correctIndices) {
    if (!filledIndexSet.has(Number(idx))) return { error: "correct" };
  }
  if (type === "SINGLE_CHOICE" && correctIndices.size !== 1) return { error: "correct" };
  if (type === "MULTIPLE_CHOICE" && correctIndices.size < 1) return { error: "correct" };

  return {
    type: type as HootQuestionType,
    text,
    options: filled.map((o) => ({ text: o.text, isCorrect: correctIndices.has(String(o.index)) })),
  };
}

export async function createHootQuestion(gameId: string, formData: FormData) {
  const admin = await requireAdmin();
  const game = await requireHootGameAccess(admin, gameId);
  requireHootGameEditable(game, `/admin/hootarena/${gameId}`);

  const parsed = parseHootQuestionForm(formData);
  if ("error" in parsed) {
    redirect(`/admin/hootarena/${gameId}/questions/new?error=${parsed.error}`);
  }

  const count = await prisma.hootQuestion.count({ where: { gameId } });

  await prisma.hootQuestion.create({
    data: {
      gameId,
      order: count,
      type: parsed.type,
      text: parsed.text,
      options: { create: parsed.options.map((o, i) => ({ text: o.text, isCorrect: o.isCorrect, order: i })) },
    },
  });

  revalidatePath(`/admin/hootarena/${gameId}`);
  redirect(`/admin/hootarena/${gameId}`);
}

export async function updateHootQuestion(gameId: string, questionId: string, formData: FormData) {
  const admin = await requireAdmin();
  const game = await requireHootGameAccess(admin, gameId);
  requireHootGameEditable(game, `/admin/hootarena/${gameId}`);

  const parsed = parseHootQuestionForm(formData);
  if ("error" in parsed) {
    redirect(`/admin/hootarena/${gameId}/questions/${questionId}/edit?error=${parsed.error}`);
  }

  await prisma.$transaction([
    prisma.hootOption.deleteMany({ where: { questionId } }),
    prisma.hootQuestion.update({
      where: { id: questionId },
      data: {
        type: parsed.type,
        text: parsed.text,
        options: { create: parsed.options.map((o, i) => ({ text: o.text, isCorrect: o.isCorrect, order: i })) },
      },
    }),
  ]);

  revalidatePath(`/admin/hootarena/${gameId}`);
  redirect(`/admin/hootarena/${gameId}`);
}

export async function deleteHootQuestion(gameId: string, questionId: string) {
  const admin = await requireAdmin();
  const game = await requireHootGameAccess(admin, gameId);
  requireHootGameEditable(game, `/admin/hootarena/${gameId}`);

  await prisma.hootQuestion.delete({ where: { id: questionId } });
  revalidatePath(`/admin/hootarena/${gameId}`);
  redirect(`/admin/hootarena/${gameId}`);
}

/** Swaps this question's `order` with its immediate neighbor - the only way to reorder, so the admin always knows the exact resulting order. */
export async function moveHootQuestion(gameId: string, questionId: string, direction: "up" | "down") {
  const admin = await requireAdmin();
  const game = await requireHootGameAccess(admin, gameId);
  requireHootGameEditable(game, `/admin/hootarena/${gameId}`);

  const questions = await prisma.hootQuestion.findMany({
    where: { gameId },
    orderBy: { order: "asc" },
  });
  const index = questions.findIndex((q) => q.id === questionId);
  if (index === -1) return;

  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= questions.length) return;

  const a = questions[index];
  const b = questions[swapWith];

  await prisma.$transaction([
    prisma.hootQuestion.update({ where: { id: a.id }, data: { order: b.order } }),
    prisma.hootQuestion.update({ where: { id: b.id }, data: { order: a.order } }),
  ]);

  revalidatePath(`/admin/hootarena/${gameId}`);
}
