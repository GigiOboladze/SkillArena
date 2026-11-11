"use server";

import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getStaffWith } from "@/lib/staff-guard";
import { generateUniqueHootPin } from "@/lib/hootarena/pin";
import { loadHootGameForAdmin } from "@/lib/hootarena/access";
import type { HootQuestionType, User } from "@/generated/prisma/client";

async function requireAdmin(): Promise<User> {
  const admin = await getStaffWith("hoot.host");
  if (!admin) redirect("/login");
  return admin;
}

/** Loads the game and verifies this admin may manage it (see loadHootGameForAdmin - same ownership model as requireQuizAccess). */
async function requireHootGameAccess(admin: User, gameId: string) {
  const game = await loadHootGameForAdmin(admin, gameId);
  if (!game) notFound();
  return game;
}

/**
 * Verifies the question belongs to the game this admin was just authorized
 * for. requireHootGameAccess only proves "you may manage THIS game" - a server
 * action is an independently invocable endpoint, so without this a regular
 * Admin could pass their own gameId together with another admin's questionId
 * and have it edited or deleted. `moveHootQuestion` is already safe because it
 * lists by parent; this gives update/delete the same guarantee.
 */
async function requireQuestionInGame(gameId: string, questionId: string) {
  const question = await prisma.hootQuestion.findFirst({
    where: { id: questionId, gameId },
    select: { id: true },
  });
  if (!question) notFound();
  return question;
}

/**
 * The next free `order` for a new question in this game.
 *
 * Deliberately max(order)+1 rather than count(): HootQuestion has a
 * @@unique([gameId, order]) constraint and deleting a middle question leaves a
 * gap without renumbering the survivors. With count(), orders {0, 2} (count 2)
 * would produce another `order: 2` and violate that constraint, surfacing as
 * an unhandled P2002. max+1 is always free.
 */
async function nextQuestionOrder(gameId: string): Promise<number> {
  const last = await prisma.hootQuestion.findFirst({
    where: { gameId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return last ? last.order + 1 : 0;
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

  const order = await nextQuestionOrder(gameId);

  await prisma.hootQuestion.create({
    data: {
      gameId,
      order,
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
  await requireQuestionInGame(gameId, questionId);

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
  await requireQuestionInGame(gameId, questionId);

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

  // Three steps through a temporary slot, not a direct two-step swap:
  // HootQuestion has a non-deferrable @@unique([gameId, order]), which
  // Postgres checks after every statement - so moving A straight onto B's
  // order collided with B and failed every Move up / Move down with a P2002.
  // A negative order can never belong to a real question (max+1 is always >= 0).
  const parking = -1 - a.order;
  await prisma.$transaction([
    prisma.hootQuestion.update({ where: { id: a.id }, data: { order: parking } }),
    prisma.hootQuestion.update({ where: { id: b.id }, data: { order: a.order } }),
    prisma.hootQuestion.update({ where: { id: a.id }, data: { order: b.order } }),
  ]);

  revalidatePath(`/admin/hootarena/${gameId}`);
}
