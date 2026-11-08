import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Saves an edited question and its answer options WITHOUT deleting and
 * re-creating the options.
 *
 * Why this matters: students' saved answers point at an option by id
 * (`AttemptAnswer.selectedOptionId` for SkillArena quizzes,
 * `Answer.selectedOptionId` for legacy homeworks), and both foreign keys are
 * `ON DELETE SET NULL`. The previous "deleteMany options, then create new
 * ones" approach therefore silently erased every student's selection for
 * that question the moment an admin fixed so much as a typo:
 *
 *  - a student mid-quiz lost the answer they had picked, and was graded as
 *    "not answered" on submit;
 *  - a student who had already finished kept their stored score, but their
 *    result page (and the admin's attempt view) showed "Not answered".
 *
 * Options are matched by position instead: option #1 stays option #1 (same
 * id, new text / correctness), so every existing selection keeps pointing at
 * the same slot. Only genuinely surplus options are deleted, and only missing
 * ones are created.
 *
 * Changing WHICH option is correct does not re-grade attempts that were
 * already submitted - their stored `isCorrect`/score are left as they were.
 */
export async function saveQuestionWithOptions(
  questionId: string,
  question: Prisma.QuestionUpdateInput,
  options: { text: string; isCorrect: boolean }[],
) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.option.findMany({
      where: { questionId },
      orderBy: { order: "asc" },
      select: { id: true },
    });

    await tx.question.update({ where: { id: questionId }, data: question });

    for (let i = 0; i < options.length; i++) {
      const data = { text: options[i].text, isCorrect: options[i].isCorrect, order: i };
      if (i < existing.length) {
        await tx.option.update({ where: { id: existing[i].id }, data });
      } else {
        await tx.option.create({ data: { ...data, questionId } });
      }
    }

    const surplus = existing.slice(options.length).map((o) => o.id);
    if (surplus.length > 0) {
      await tx.option.deleteMany({ where: { id: { in: surplus } } });
    }
  },
  // The connection pool is deliberately small (connection_limit in
  // DATABASE_URL), so during a busy moment waiting for a free connection can
  // exceed Prisma's 2s default; give an admin's save more headroom than that.
  { maxWait: 10_000, timeout: 15_000 });
}
