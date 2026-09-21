"use server";

import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { customAlphabet } from "nanoid";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { listSubjectsWithGroups } from "@/lib/subjects";
import type { User } from "@/generated/prisma/client";

async function requireAdmin() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

/**
 * Loads the target student and verifies this admin may manage them - a
 * regular Admin only for a student in their own program, the Super Admin
 * for any student. Every mutation in this file goes through this (or
 * `requireAdmin` + an explicit program check for creation) rather than
 * trusting the admin dashboard's own nav/filtering to keep a regular Admin
 * scoped correctly - hiding the other program's students from a list is not
 * what makes this safe.
 */
async function requireAdminForStudent(studentId: string): Promise<{ admin: User; student: User }> {
  const admin = await requireAdmin();
  const student = await prisma.user.findFirst({ where: { id: studentId, role: "STUDENT" } });
  if (!student) notFound();
  if (admin.role !== "SUPER_ADMIN" && student.programId !== admin.programId) notFound();
  return { admin, student };
}

// No look-alike characters, easy to read aloud/write down for handing to a student.
const generateTempPassword = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz", 10);

const UNASSIGNED = "__unassigned__";

/**
 * Reads `group_<subjectId>` fields against the given program's real
 * subject/group list. Each field is one of three values (see
 * SubjectGroupFields): UNASSIGNED (skip - no row for this subject),
 * "" (assigned, no group yet - a row with a null groupId), or a real group
 * id (assigned to that group).
 */
async function parseSubjectGroupAssignments(programId: string, formData: FormData) {
  const subjects = await listSubjectsWithGroups(programId);
  const assignments: { subjectId: string; groupId: string | null }[] = [];

  for (const subject of subjects) {
    // `formData.get` returning "" (the real "no group yet" value) is falsy
    // in JS - `?? UNASSIGNED` (missing-field check) rather than `|| UNASSIGNED`
    // (falsy-value check) is required here so that case isn't silently
    // treated as UNASSIGNED.
    const field = formData.get(`group_${subject.id}`);
    const raw = field === null ? UNASSIGNED : String(field);
    if (raw === UNASSIGNED) continue;
    if (raw && !subject.groups.some((g) => g.id === raw)) continue;
    assignments.push({ subjectId: subject.id, groupId: raw || null });
  }
  return assignments;
}

export async function createStudent(programId: string, formData: FormData) {
  const admin = await requireAdmin();
  if (admin.role !== "SUPER_ADMIN" && programId !== admin.programId) {
    redirect("/admin/students?error=missing");
  }
  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program) redirect("/admin/students?error=missing");

  const firstName = String(formData.get("firstName") || "").trim();
  const lastName = String(formData.get("lastName") || "").trim();
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "").trim() || generateTempPassword();

  if (!firstName || !lastName || !username) {
    redirect(`/admin/students?program=${programId}&error=missing`);
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    redirect(`/admin/students?program=${programId}&error=taken`);
  }

  const assignments = await parseSubjectGroupAssignments(programId, formData);
  const passwordHash = await hashPassword(password);

  await prisma.user.create({
    data: {
      firstName,
      lastName,
      username,
      passwordHash,
      role: "STUDENT",
      programId,
      subjectGroups: { create: assignments },
    },
  });

  revalidatePath("/admin/students");
  redirect(
    `/admin/students?program=${programId}&created=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
  );
}

export async function updateStudent(studentId: string, formData: FormData) {
  const { student } = await requireAdminForStudent(studentId);

  const firstName = String(formData.get("firstName") || "").trim();
  const lastName = String(formData.get("lastName") || "").trim();
  const username = String(formData.get("username") || "").trim().toLowerCase();

  if (!firstName || !lastName || !username) {
    redirect(`/admin/students/${studentId}/edit?error=missing`);
  }
  // programId is never read from this form - a student's program can only
  // change through changeStudentProgram below (Super Admin only).
  if (!student.programId) redirect(`/admin/students/${studentId}`);

  const usernameClash = await prisma.user.findFirst({ where: { username, id: { not: studentId } } });
  if (usernameClash) {
    redirect(`/admin/students/${studentId}/edit?error=taken`);
  }

  const assignments = await parseSubjectGroupAssignments(student.programId, formData);

  await prisma.$transaction([
    prisma.user.update({ where: { id: studentId }, data: { firstName, lastName, username } }),
    prisma.studentSubjectGroup.deleteMany({ where: { studentId } }),
    prisma.studentSubjectGroup.createMany({
      data: assignments.map((a) => ({ studentId, subjectId: a.subjectId, groupId: a.groupId })),
    }),
  ]);

  revalidatePath("/admin/students");
  revalidatePath(`/admin/students/${studentId}`);
  redirect(`/admin/students/${studentId}?updated=1`);
}

/**
 * Super Admin only: moves a student to a different program. Any existing
 * subject/group assignments are cleared in the same transaction - they were
 * assignments into the OLD program's subjects, which are meaningless (and,
 * per eligibleHomeworkWhere's explicit program check, inert) once the
 * student is no longer in that program. This never touches QuizAttempt rows
 * - historical scores/attempts are permanently preserved and permanently
 * attributed to the program the quiz they were taken under belongs to (see
 * getCumulativeLeaderboard's doc comment for the full policy).
 */
export async function changeStudentProgram(studentId: string, formData: FormData) {
  const admin = await requireAdmin();
  if (admin.role !== "SUPER_ADMIN") redirect(`/admin/students/${studentId}`);

  const student = await prisma.user.findFirst({ where: { id: studentId, role: "STUDENT" } });
  if (!student) notFound();

  const programId = String(formData.get("programId") || "");
  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program) redirect(`/admin/students/${studentId}?error=program`);

  if (programId !== student.programId) {
    await prisma.$transaction([
      prisma.studentSubjectGroup.deleteMany({ where: { studentId } }),
      prisma.user.update({ where: { id: studentId }, data: { programId } }),
    ]);
  }

  revalidatePath("/admin/students");
  revalidatePath(`/admin/students/${studentId}`);
  redirect(`/admin/students/${studentId}?programChanged=1`);
}

export async function resetStudentPassword(studentId: string) {
  const { student } = await requireAdminForStudent(studentId);

  const password = generateTempPassword();
  const passwordHash = await hashPassword(password);
  // Bumping sessionVersion signs the student out everywhere immediately -
  // an admin-issued reset must not leave an already-logged-in session (e.g.
  // on a shared classroom device) still valid under the old password.
  await prisma.user.update({
    where: { id: studentId },
    data: { passwordHash, sessionVersion: { increment: 1 } },
  });

  revalidatePath("/admin/students");
  redirect(
    `/admin/students?program=${student.programId}&created=${encodeURIComponent(student.username)}&password=${encodeURIComponent(password)}`
  );
}

/** Admin-chosen (not auto-generated) password, entered and confirmed on the student detail page. */
export async function setStudentPassword(studentId: string, formData: FormData) {
  await requireAdminForStudent(studentId);

  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (password.length < 8) redirect(`/admin/students/${studentId}?pwerror=weak`);
  if (password !== confirmPassword) redirect(`/admin/students/${studentId}?pwerror=mismatch`);

  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: studentId },
    data: { passwordHash, sessionVersion: { increment: 1 } },
  });

  redirect(`/admin/students/${studentId}?password=${encodeURIComponent(password)}`);
}

export async function deleteStudent(studentId: string) {
  const { student } = await requireAdminForStudent(studentId);
  await prisma.user.deleteMany({ where: { id: studentId, role: "STUDENT" } });
  revalidatePath("/admin/students");
  redirect(`/admin/students?program=${student.programId}`);
}
