"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { customAlphabet } from "nanoid";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { putPasswordFlash } from "@/lib/password-flash";
import { getStaffWith } from "@/lib/staff-guard";
import { ASSIGNABLE_STAFF_ROLES, type AssignableStaffRole } from "@/lib/authz";
import type { Prisma, UserRole } from "@/generated/prisma/client";

// Staff & Access Management. Only the Super Admin (capability staff.manage)
// reaches any of this; every action re-checks it itself.
//
// There is NO limit on how many staff accounts exist. The old 8-admin cap
// (MAX_ADMINS) is gone - the only constraints left are per-account
// validity rules below.

async function requireSuperAdmin() {
  const superAdmin = await getStaffWith("staff.manage");
  if (!superAdmin) redirect("/admin");
  return superAdmin;
}

const generateTempPassword = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz", 12);
const USERNAME_RE = /^[a-z0-9._-]{3,40}$/;

type Assignments = {
  groupIds: string[];
  studentIds: string[];
  cohortIds: string[];
  captainIds: string[];
};

function readList(formData: FormData, key: string): string[] {
  return [...new Set(formData.getAll(key).map(String).filter(Boolean))].slice(0, 2000);
}

function readAssignments(formData: FormData): Assignments {
  return {
    groupIds: readList(formData, "groupIds"),
    studentIds: readList(formData, "studentIds"),
    cohortIds: readList(formData, "cohortIds"),
    captainIds: readList(formData, "captainIds"),
  };
}

/**
 * Verifies every submitted assignment really belongs to `programId` and fits
 * the role, and returns only the rows that do. Nothing a form sends is
 * trusted as-is: a group from another program, a non-student id or a captain
 * from elsewhere is silently dropped here.
 */
async function validatedAssignments(role: AssignableStaffRole, programId: string, a: Assignments, selfId?: string) {
  const result = {
    groups: [] as { subjectId: string; groupId: string }[],
    studentIds: [] as string[],
    cohortIds: [] as string[],
    captainIds: [] as string[],
  };
  if (role === "LECTURER" && a.groupIds.length) {
    const groups = await prisma.group.findMany({
      where: { id: { in: a.groupIds }, subject: { programId } },
      select: { id: true, subjectId: true },
    });
    result.groups = groups.map((g) => ({ subjectId: g.subjectId, groupId: g.id }));
  }
  if (role === "JUNIOR_CAPTAIN" && a.studentIds.length) {
    const students = await prisma.user.findMany({
      where: { id: { in: a.studentIds }, role: "STUDENT", programId },
      select: { id: true },
    });
    result.studentIds = students.map((s) => s.id);
  }
  if (role === "MIDDLE_CAPTAIN" && a.cohortIds.length) {
    const cohorts = await prisma.cohort.findMany({ where: { id: { in: a.cohortIds }, programId }, select: { id: true } });
    result.cohortIds = cohorts.map((c) => c.id);
  }
  if (role === "SENIOR_CAPTAIN" && a.captainIds.length) {
    const captains = await prisma.user.findMany({
      where: {
        id: { in: a.captainIds, ...(selfId ? { not: selfId } : {}) },
        role: { in: ["JUNIOR_CAPTAIN", "MIDDLE_CAPTAIN"] },
        programId,
      },
      select: { id: true },
    });
    result.captainIds = captains.map((c) => c.id);
  }
  return result;
}

/** Replaces every scope-assignment row this account owns with the validated set, inside the caller's transaction. */
function replaceAssignments(
  tx: Prisma.TransactionClient,
  userId: string,
  v: Awaited<ReturnType<typeof validatedAssignments>>
) {
  return Promise.all([
    tx.lecturerAssignment.deleteMany({ where: { userId } }),
    tx.captainStudent.deleteMany({ where: { captainId: userId } }),
    tx.cohortCaptain.deleteMany({ where: { captainId: userId } }),
    tx.captainSupervision.deleteMany({ where: { seniorId: userId } }),
  ]).then(() =>
    Promise.all([
      v.groups.length
        ? tx.lecturerAssignment.createMany({ data: v.groups.map((g) => ({ userId, ...g })), skipDuplicates: true })
        : null,
      v.studentIds.length
        ? tx.captainStudent.createMany({ data: v.studentIds.map((studentId) => ({ captainId: userId, studentId })), skipDuplicates: true })
        : null,
      v.cohortIds.length
        ? tx.cohortCaptain.createMany({ data: v.cohortIds.map((cohortId) => ({ captainId: userId, cohortId })), skipDuplicates: true })
        : null,
      v.captainIds.length
        ? tx.captainSupervision.createMany({ data: v.captainIds.map((captainId) => ({ seniorId: userId, captainId })), skipDuplicates: true })
        : null,
    ])
  );
}

function parseRole(raw: string): AssignableStaffRole | null {
  return (ASSIGNABLE_STAFF_ROLES as readonly string[]).includes(raw) ? (raw as AssignableStaffRole) : null;
}

export async function createStaff(formData: FormData) {
  await requireSuperAdmin();

  const firstName = String(formData.get("firstName") || "").trim().slice(0, 60);
  const lastName = String(formData.get("lastName") || "").trim().slice(0, 60);
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const role = parseRole(String(formData.get("role") || ""));
  const programId = String(formData.get("programId") || "").trim();
  const chosenPassword = String(formData.get("password") || "");

  if (!firstName) redirect("/admin/team/new?error=name");
  if (!USERNAME_RE.test(username)) redirect("/admin/team/new?error=username");
  // SUPER_ADMIN and legacy ADMIN are never creatable here - only the five staff roles.
  if (!role) redirect("/admin/team/new?error=role");
  if (chosenPassword && chosenPassword.length < 8) redirect("/admin/team/new?error=weak");
  const program = programId ? await prisma.program.findUnique({ where: { id: programId }, select: { id: true } }) : null;
  if (!program) redirect("/admin/team/new?error=program");
  if (await prisma.user.findUnique({ where: { username }, select: { id: true } })) {
    redirect("/admin/team/new?error=taken");
  }

  const assignments = await validatedAssignments(role, program.id, readAssignments(formData));
  const password = chosenPassword || generateTempPassword();
  const passwordHash = await hashPassword(password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { firstName, lastName, username, passwordHash, role, programId: program.id },
    });
    await replaceAssignments(tx, created.id, assignments);
    return created;
  });

  revalidatePath("/admin/team");
  redirect(`/admin/team/${user.id}?created=1&pw=${putPasswordFlash(password)}`);
}

/** Loads a staff account the Super Admin may edit. The Super Admin's own account is never editable here. */
async function loadEditableStaff(staffId: string) {
  const user = await prisma.user.findFirst({
    where: { id: staffId, role: { notIn: ["STUDENT", "SUPER_ADMIN"] } },
  });
  if (!user) redirect("/admin/team");
  return user;
}

export async function updateStaff(staffId: string, formData: FormData) {
  await requireSuperAdmin();
  const user = await loadEditableStaff(staffId);

  const firstName = String(formData.get("firstName") || "").trim().slice(0, 60);
  const lastName = String(formData.get("lastName") || "").trim().slice(0, 60);
  const programId = String(formData.get("programId") || "").trim();
  const rawRole = String(formData.get("role") || "");

  if (!firstName) redirect(`/admin/team/${staffId}?error=name`);
  const program = await prisma.program.findUnique({ where: { id: programId }, select: { id: true } });
  if (!program) redirect(`/admin/team/${staffId}?error=program`);

  // A legacy ADMIN may stay ADMIN (nothing changes) until the Super Admin
  // deliberately picks one of the new roles. Nobody can be moved TO admin
  // or super admin through this form.
  let role: UserRole;
  if (rawRole === "ADMIN" && user.role === "ADMIN") role = "ADMIN";
  else {
    const parsed = parseRole(rawRole);
    if (!parsed) redirect(`/admin/team/${staffId}?error=role`);
    role = parsed;
  }

  const roleOrProgramChanged = role !== user.role || program.id !== user.programId;
  const assignments =
    role === "ADMIN"
      ? { groups: [], studentIds: [], cohortIds: [], captainIds: [] }
      : await validatedAssignments(role as AssignableStaffRole, program.id, readAssignments(formData), user.id);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        firstName,
        lastName,
        role,
        programId: program.id,
        // A role or program change signs the account out everywhere, so no
        // session keeps acting with the old permissions.
        ...(roleOrProgramChanged ? { sessionVersion: { increment: 1 } } : {}),
      },
    });
    await replaceAssignments(tx, user.id, assignments);
    // Someone who is no longer a Junior/Middle Captain (or moved program)
    // stops being supervised by Senior Captains.
    if (roleOrProgramChanged) {
      await tx.captainSupervision.deleteMany({ where: { captainId: user.id } });
    }
  });

  revalidatePath("/admin/team");
  revalidatePath(`/admin/team/${staffId}`);
  redirect(`/admin/team/${staffId}?saved=1`);
}

export async function setStaffActive(staffId: string, active: boolean) {
  await requireSuperAdmin();
  const user = await loadEditableStaff(staffId);
  if (user.isActive === active) redirect(`/admin/team/${staffId}`);
  await prisma.user.update({
    where: { id: user.id },
    // Deactivation also bumps sessionVersion, ending every live session at once.
    data: { isActive: active, sessionVersion: { increment: 1 } },
  });
  revalidatePath("/admin/team");
  revalidatePath(`/admin/team/${staffId}`);
  redirect(`/admin/team/${staffId}?${active ? "activated" : "deactivated"}=1`);
}

export async function resetStaffPassword(staffId: string) {
  await requireSuperAdmin();
  const user = await loadEditableStaff(staffId);
  const password = generateTempPassword();
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password), sessionVersion: { increment: 1 } },
  });
  revalidatePath(`/admin/team/${staffId}`);
  redirect(`/admin/team/${staffId}?pw=${putPasswordFlash(password)}`);
}

// --- Cohorts (Programs area) ----------------------------------------------

async function requireProgramsManager() {
  const staff = await getStaffWith("programs.manage");
  if (!staff) redirect("/admin");
  return staff;
}

export async function createCohort(formData: FormData) {
  await requireProgramsManager();
  const name = String(formData.get("name") || "").trim().slice(0, 60);
  const programId = String(formData.get("programId") || "");
  if (!name) redirect(`/admin/cohorts?program=${programId}&error=name`);
  const program = await prisma.program.findUnique({ where: { id: programId }, select: { id: true } });
  if (!program) redirect("/admin/cohorts?error=program");
  const exists = await prisma.cohort.findFirst({ where: { programId, name }, select: { id: true } });
  if (exists) redirect(`/admin/cohorts?program=${programId}&error=taken`);
  const cohort = await prisma.cohort.create({ data: { name, programId } });
  revalidatePath("/admin/cohorts");
  redirect(`/admin/cohorts/${cohort.id}`);
}

/** Replaces a cohort's member list. A student moved into this cohort leaves their previous one (one cohort per student). */
export async function setCohortMembers(cohortId: string, formData: FormData) {
  await requireProgramsManager();
  const cohort = await prisma.cohort.findUnique({ where: { id: cohortId } });
  if (!cohort) redirect("/admin/cohorts");
  const requested = readList(formData, "studentIds");
  const students = await prisma.user.findMany({
    where: { id: { in: requested }, role: "STUDENT", programId: cohort.programId },
    select: { id: true },
  });
  const ids = students.map((s) => s.id);
  await prisma.$transaction([
    prisma.cohortMember.deleteMany({ where: { OR: [{ cohortId }, { studentId: { in: ids } }] } }),
    prisma.cohortMember.createMany({ data: ids.map((studentId) => ({ cohortId, studentId })) }),
  ]);
  revalidatePath(`/admin/cohorts/${cohortId}`);
  revalidatePath("/admin/cohorts");
  redirect(`/admin/cohorts/${cohortId}?saved=1`);
}

export async function renameCohort(cohortId: string, formData: FormData) {
  await requireProgramsManager();
  const cohort = await prisma.cohort.findUnique({ where: { id: cohortId } });
  if (!cohort) redirect("/admin/cohorts");
  const name = String(formData.get("name") || "").trim().slice(0, 60);
  if (!name) redirect(`/admin/cohorts/${cohortId}?error=name`);
  const clash = await prisma.cohort.findFirst({ where: { programId: cohort.programId, name, id: { not: cohortId } } });
  if (clash) redirect(`/admin/cohorts/${cohortId}?error=taken`);
  await prisma.cohort.update({ where: { id: cohortId }, data: { name } });
  revalidatePath(`/admin/cohorts/${cohortId}`);
  redirect(`/admin/cohorts/${cohortId}?saved=1`);
}
