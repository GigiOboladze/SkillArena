import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { Prisma, User } from "@/generated/prisma/client";

// Row-level scope for every staff role. src/lib/authz.ts says whether a role
// may use an area at all; these helpers say which rows it reaches. Every
// staff role except SUPER_ADMIN is also walled into its own program
// (users.programId is mandatory for them at the database level), so a scope
// can never leak across programs even if an assignment row were wrong.

type Staff = Pick<User, "id" | "role" | "programId">;

const NONE = { id: { in: [] as string[] } };

/** Groups a Lecturer teaches (one row per subject/group). */
export const lecturerGroups = cache(async (userId: string) =>
  prisma.lecturerAssignment.findMany({
    where: { userId },
    select: { subjectId: true, groupId: true },
  })
);

/** Captains a Senior Captain supervises. */
export const supervisedCaptainIds = cache(async (seniorId: string) =>
  (await prisma.captainSupervision.findMany({ where: { seniorId }, select: { captainId: true } })).map(
    (r) => r.captainId
  )
);

function programWall(staff: Staff): Prisma.UserWhereInput {
  if (staff.role === "SUPER_ADMIN") return {};
  return staff.programId ? { programId: staff.programId } : NONE;
}

/** Prisma filter for the students this staff member may see. Deny by default. */
export async function studentScopeWhere(staff: Staff): Promise<Prisma.UserWhereInput> {
  const base: Prisma.UserWhereInput = { role: "STUDENT", ...programWall(staff) };
  switch (staff.role) {
    case "SUPER_ADMIN":
    case "ADMIN":
    case "SUCCESS_MANAGER":
      return base;
    case "LECTURER": {
      const groups = await lecturerGroups(staff.id);
      if (groups.length === 0) return NONE;
      return { ...base, subjectGroups: { some: { groupId: { in: groups.map((g) => g.groupId) } } } };
    }
    case "JUNIOR_CAPTAIN":
      return { ...base, assignedCaptains: { some: { captainId: staff.id } } };
    case "MIDDLE_CAPTAIN":
      return { ...base, cohortMembership: { cohort: { captains: { some: { captainId: staff.id } } } } };
    case "SENIOR_CAPTAIN": {
      const ids = await supervisedCaptainIds(staff.id);
      if (ids.length === 0) return NONE;
      return {
        ...base,
        OR: [
          { assignedCaptains: { some: { captainId: { in: ids } } } },
          { cohortMembership: { cohort: { captains: { some: { captainId: { in: ids } } } } } },
        ],
      };
    }
    default:
      return NONE;
  }
}

/** Whether this staff member may see this one student. */
export async function canViewStudent(staff: Staff, studentId: string): Promise<boolean> {
  const where = await studentScopeWhere(staff);
  return (await prisma.user.count({ where: { AND: [where, { id: studentId }] } })) > 0;
}

/** Prisma filter for the QUIZ-mode homeworks this staff member may manage and read results of. */
export async function quizScopeWhere(staff: Staff): Promise<Prisma.HomeworkWhereInput> {
  const base: Prisma.HomeworkWhereInput = { mode: "QUIZ" };
  switch (staff.role) {
    case "SUPER_ADMIN":
      return base;
    case "ADMIN":
      return staff.programId ? { ...base, subject: { programId: staff.programId } } : { id: { in: [] } };
    case "LECTURER": {
      const groups = await lecturerGroups(staff.id);
      if (groups.length === 0) return { id: { in: [] } };
      const groupIds = groups.map((g) => g.groupId);
      return {
        ...base,
        subjectId: { in: [...new Set(groups.map((g) => g.subjectId))] },
        OR: [
          { ownerUserId: staff.id },
          // Someone else's quiz in a subject they teach: only if every group
          // it is assigned to is one of their own groups.
          { targetGroups: { some: {}, every: { groupId: { in: groupIds } } } },
        ],
      };
    }
    case "MIDDLE_CAPTAIN":
    case "SENIOR_CAPTAIN":
      // Captains manage only the quizzes they created themselves.
      return staff.programId
        ? { ...base, ownerUserId: staff.id, subject: { programId: staff.programId } }
        : { id: { in: [] } };
    default:
      return { id: { in: [] } };
  }
}

export async function canManageQuiz(staff: Staff, quizId: string): Promise<boolean> {
  const where = await quizScopeWhere(staff);
  return (await prisma.homework.count({ where: { AND: [where, { id: quizId }] } })) > 0;
}

/**
 * Subjects (and, per subject, the groups) this staff member may create quizzes
 * for and assign quizzes to. `null` group list = every group of that subject.
 */
export async function quizSubjectScope(
  staff: Staff
): Promise<{ subjectIds: string[] | null; groupIdsBySubject: Map<string, string[]> | null }> {
  if (staff.role === "LECTURER") {
    const groups = await lecturerGroups(staff.id);
    const bySubject = new Map<string, string[]>();
    for (const g of groups) bySubject.set(g.subjectId, [...(bySubject.get(g.subjectId) ?? []), g.groupId]);
    return { subjectIds: [...bySubject.keys()], groupIdsBySubject: bySubject };
  }
  return { subjectIds: null, groupIdsBySubject: null };
}

/** Prisma filter for INCO messages this staff member may read. Old messages without a program stay Super Admin only. */
export function incoScopeWhere(staff: Staff): Prisma.IncoSubmissionWhereInput {
  if (staff.role === "SUPER_ADMIN") return {};
  if (staff.role === "SUCCESS_MANAGER" && staff.programId) return { programId: staff.programId };
  return { id: { in: [] } };
}

/** The single program a non-Super-Admin staff member is walled into (null for Super Admin = any). */
export function staffProgramId(staff: Staff): string | null {
  return staff.role === "SUPER_ADMIN" ? null : staff.programId;
}

/** Narrows a program's subject/group list to what this staff member may create quizzes for (Lecturers: their own subjects and groups). */
export async function scopeSubjectsForQuizzes<S extends { id: string; groups: { id: string }[] }>(
  staff: Staff,
  subjects: S[]
): Promise<S[]> {
  const scope = await quizSubjectScope(staff);
  if (!scope.subjectIds || !scope.groupIdsBySubject) return subjects;
  const map = scope.groupIdsBySubject;
  return subjects
    .filter((s) => map.has(s.id))
    .map((s) => ({ ...s, groups: s.groups.filter((g) => map.get(s.id)!.includes(g.id)) }));
}
