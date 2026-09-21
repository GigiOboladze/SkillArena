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

export async function getSubjectWithGroups(subjectId: string) {
  return prisma.subject.findUnique({
    where: { id: subjectId },
    include: { groups: { orderBy: { order: "asc" } } },
  });
}

export type StudentMembership = Awaited<ReturnType<typeof getStudentMemberships>>[number];

export async function getStudentMemberships(studentId: string) {
  return prisma.studentSubjectGroup.findMany({
    where: { studentId },
    include: { subject: true, group: true },
    orderBy: { subject: { order: "asc" } },
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
export async function eligibleHomeworkWhere(studentId: string): Promise<Prisma.HomeworkWhereInput> {
  const student = await prisma.user.findUnique({ where: { id: studentId }, select: { programId: true } });
  if (!student?.programId) {
    return { id: "__no_program__" };
  }

  const memberships = await prisma.studentSubjectGroup.findMany({
    where: { studentId, groupId: { not: null }, subject: { programId: student.programId } },
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

/** Direct eligibility check for one specific homework - used before starting/opening a quiz, not just for listing. */
export async function isStudentEligibleForQuiz(
  studentId: string,
  homeworkId: string,
  subjectId: string | null
): Promise<boolean> {
  if (!subjectId) return false;

  const [student, subject] = await Promise.all([
    prisma.user.findUnique({ where: { id: studentId }, select: { programId: true } }),
    prisma.subject.findUnique({ where: { id: subjectId }, select: { programId: true } }),
  ]);
  if (!student?.programId || !subject || student.programId !== subject.programId) return false;

  const membership = await prisma.studentSubjectGroup.findUnique({
    where: { studentId_subjectId: { studentId, subjectId } },
  });
  if (!membership?.groupId) return false;

  const targeted = await prisma.quizTargetGroup.findUnique({
    where: { homeworkId_groupId: { homeworkId, groupId: membership.groupId } },
  });
  return !!targeted;
}

/** Subjects this student is assigned to but has no group for yet - shown on the dashboard with a "no group yet" message instead of any quizzes. */
export async function getUngroupedSubjectAssignments(studentId: string) {
  return prisma.studentSubjectGroup.findMany({
    where: { studentId, groupId: null },
    include: { subject: true },
    orderBy: { subject: { order: "asc" } },
  });
}
