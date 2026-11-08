import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export async function listSubjectsWithGroups(programId: string) {
  return prisma.subject.findMany({
    where: { programId },
    orderBy: { order: "asc" },
    include: { groups: { orderBy: { order: "asc" } } },
  });
}

/**
 * A Prisma where-fragment for `Homework.findMany` matching every QUIZ-mode
 * homework this student is eligible to see: `Student.group ∈ Quiz.TargetGroups`
 * for a subject the student is assigned to, evaluated server-side. Two
 * defense-in-depth details beyond the obvious group match:
 *
 * - A membership with no group yet (`groupId: null` - see StudentSubjectGroup's
 *   schema comment) is filtered out before building the query, not just left
 *   to fail the target-group match, so its intent is explicit here.
 * - Every candidate subject is additionally required to belong to the
 *   student's OWN current program, even though a student should only ever
 *   be assignable to their own program's subjects in the first place - this
 *   is what keeps a stale assignment from a *previous* program (if a Super
 *   Admin ever changed the student's program without also clearing old
 *   assignments some other way) from granting access to a quiz that no
 *   longer belongs to the student's current program.
 *
 * A student with zero eligible memberships gets a fragment that matches
 * nothing (Prisma's `OR: []` would otherwise match everything, which is the
 * opposite of what we want here).
 */
export async function eligibleHomeworkWhere(
  studentId: string,
  // Callers that already hold the student row pass its programId to skip a
  // redundant lookup. Must be the student's CURRENT programId (read from their
  // own row), never a client-supplied value.
  knownProgramId?: string | null
): Promise<Prisma.HomeworkWhereInput> {
  const programId =
    knownProgramId !== undefined
      ? knownProgramId
      : (await prisma.user.findUnique({ where: { id: studentId }, select: { programId: true } }))?.programId;
  if (!programId) {
    return { id: "__no_program__" };
  }

  const memberships = await prisma.studentSubjectGroup.findMany({
    where: { studentId, groupId: { not: null }, subject: { programId } },
    select: { subjectId: true, groupId: true },
  });

  if (memberships.length === 0) {
    return { id: "__no_memberships__" };
  }

  return {
    OR: memberships.map((m) => ({
      subjectId: m.subjectId,
      targetGroups: { some: { groupId: m.groupId as string } },
    })),
  };
}

/**
 * Direct eligibility check for one specific homework - used before
 * starting/opening a quiz, not just for listing. Same three rules as
 * eligibleHomeworkWhere: the quiz's subject belongs to the student's current
 * program, the student is assigned to that subject WITH a group, and that
 * group is one the quiz targets.
 *
 * One query: all three conditions are expressed as a single relational filter
 * on the student's own membership row (previously four round trips, two of
 * them sequential).
 */
export async function isStudentEligibleForQuiz(
  student: { id: string; programId: string | null },
  homeworkId: string,
  subjectId: string | null
): Promise<boolean> {
  if (!subjectId || !student.programId) return false;

  const membership = await prisma.studentSubjectGroup.findFirst({
    where: {
      studentId: student.id,
      subjectId,
      subject: { programId: student.programId },
      group: { quizTargets: { some: { homeworkId } } },
    },
    select: { id: true },
  });
  return !!membership;
}

/** Subjects this student is assigned to but has no group for yet - shown on the dashboard with a "no group yet" message instead of any quizzes. */
export async function getUngroupedSubjectAssignments(studentId: string) {
  return prisma.studentSubjectGroup.findMany({
    where: { studentId, groupId: null },
    include: { subject: true },
    orderBy: { subject: { order: "asc" } },
  });
}
