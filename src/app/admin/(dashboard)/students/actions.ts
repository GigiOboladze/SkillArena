"use server";

import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { customAlphabet } from "nanoid";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { listSubjectsWithGroups } from "@/lib/subjects";
import { putPasswordFlash } from "@/lib/password-flash";
import { MAX_ATTACHMENT_SIZE, sniffImageContentType } from "@/lib/bug-reports";
import { parseHobbies, serializeHobbies } from "@/lib/hobbies";
import { MAX_SCHEDULE_ENTRIES, isIcon, isTone, parseTime } from "@/lib/schedule";
import type { User } from "@/generated/prisma/client";

async function requireAdmin() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
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

  // New picker (SubjectAssignmentPicker): an `assign_<subjectId>` checkbox
  // plus `group_<subjectId>` radios carrying only real group ids. Picking a
  // group implies the subject is assigned.
  if (formData.get("sg_mode") === "picker") {
    for (const subject of subjects) {
      const assigned = formData.get(`assign_${subject.id}`) !== null;
      const raw = formData.get(`group_${subject.id}`);
      const groupId = raw !== null && subject.groups.some((g) => g.id === String(raw)) ? String(raw) : null;
      if (!assigned && !groupId) continue;
      assignments.push({ subjectId: subject.id, groupId });
    }
    return assignments;
  }

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

/** Optional profile fields: hobby (free text) and communication skill (0.5-5 stars, blank = not rated). */
function parseProfileFields(formData: FormData): { hobby?: string | null; communicationSkill?: number | null } {
  const out: { hobby?: string | null; communicationSkill?: number | null } = {};
  if (formData.has("hobby")) {
    out.hobby = serializeHobbies(parseHobbies(String(formData.get("hobby") || "")));
  }
  if (formData.has("communicationSkill")) {
    const n = Number(formData.get("communicationSkill"));
    out.communicationSkill = Number.isFinite(n) && n > 0 ? Math.min(5, Math.max(0.5, Math.round(n * 2) / 2)) : null;
  }
  return out;
}

export async function createStudent(programId: string, formData: FormData) {
  const admin = await requireAdmin();
  if (admin.role !== "SUPER_ADMIN" && programId !== admin.programId) {
    redirect("/admin/students/new?error=missing");
  }
  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program) redirect("/admin/students/new?error=program");

  const firstName = String(formData.get("firstName") || "").trim();
  const lastName = String(formData.get("lastName") || "").trim();
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "").trim() || generateTempPassword();

  if (!firstName || !lastName || !username) {
    redirect(`/admin/students/new?program=${programId}&error=missing`);
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    redirect(`/admin/students/new?program=${programId}&error=taken`);
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
      ...parseProfileFields(formData),
      subjectGroups: { create: assignments },
    },
  });

  revalidatePath("/admin/students");
  redirect(
    `/admin/students?program=${programId}&created=${encodeURIComponent(username)}&pw=${putPasswordFlash(password)}`
  );
}

/** "Create student" page: the program comes from the form (Super Admin) or is the admin's own program. */
export async function createStudentFromForm(formData: FormData) {
  const admin = await requireAdmin();
  const programId =
    admin.role === "SUPER_ADMIN" ? String(formData.get("programId") || "") : (admin.programId ?? "");
  await createStudent(programId, formData);
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
    prisma.user.update({
      where: { id: studentId },
      data: { firstName, lastName, username, ...parseProfileFields(formData) },
    }),
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

/**
 * The students list renders one reset form and one delete form per student.
 * They post the id as a plain hidden field instead of binding it with
 * `action.bind(null, id)`: every bound action is serialized into the page as
 * extra hidden fields plus an RSC-payload entry, and each one streams as its
 * own suspended chunk - for a 300-student list that was ~140 KB of extra
 * markup. Bound or not, the id is client-supplied and never trusted:
 * `requireAdminForStudent` re-checks it on every call.
 */
function studentIdFrom(formData: FormData): string {
  const studentId = String(formData.get("studentId") || "");
  if (!studentId) notFound();
  return studentId;
}

export async function resetStudentPassword(formData: FormData) {
  const studentId = studentIdFrom(formData);
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
    `/admin/students?program=${student.programId}&created=${encodeURIComponent(student.username)}&pw=${putPasswordFlash(password)}`
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

  redirect(`/admin/students/${studentId}?pw=${putPasswordFlash(password)}`);
}

export async function deleteStudent(formData: FormData) {
  const studentId = studentIdFrom(formData);
  const { student } = await requireAdminForStudent(studentId);
  await prisma.user.deleteMany({ where: { id: studentId, role: "STUDENT" } });
  revalidatePath("/admin/students");
  redirect(`/admin/students?program=${student.programId}`);
}

// ---------------------------------------------------------------------------
// Student profile: hobby / communication skill / motivation, and the
// admin-only activity log. Every action re-checks access to the student.
// ---------------------------------------------------------------------------

function authorLabel(admin: User, requested: FormDataEntryValue | null): string {
  // "Lecturer" is a label the writer picks for an entry (admins are often
  // also the lecturers) - otherwise the entry shows the writer's real role.
  if (requested === "Lecturer") return "Lecturer";
  return admin.role === "SUPER_ADMIN" ? "Super Admin" : "Admin";
}

/** Hobby and communication skill, editable from the student's profile page at any time. */
export async function updateStudentProfile(studentId: string, formData: FormData) {
  await requireAdminForStudent(studentId);
  await prisma.user.update({ where: { id: studentId }, data: parseProfileFields(formData) });
  revalidatePath(`/admin/students/${studentId}`);
  revalidatePath("/admin/students");
  redirect(`/admin/students/${studentId}?saved=profile`);
}

/** Sets motivation (0-100%) and records the change in the activity log. */
export async function setStudentMotivation(studentId: string, formData: FormData) {
  const { admin, student } = await requireAdminForStudent(studentId);
  const n = Number(formData.get("motivation"));
  if (!Number.isFinite(n)) redirect(`/admin/students/${studentId}?error=motivation`);
  const motivation = Math.min(100, Math.max(0, Math.round(n)));
  const note = String(formData.get("note") || "").trim().slice(0, 2000);
  const from = student.motivation;

  if (from !== motivation || note) {
    const body =
      (from === null ? `Motivation set to ${motivation}%.` : `Motivation changed from ${from}% to ${motivation}%.`) +
      (note ? ` ${note}` : "");
    await prisma.$transaction([
      prisma.user.update({ where: { id: studentId }, data: { motivation } }),
      prisma.studentNote.create({
        data: {
          studentId,
          authorId: admin.id,
          authorName: admin.username,
          authorRole: authorLabel(admin, formData.get("as")),
          kind: "MOTIVATION",
          body,
          motivationFrom: from,
          motivationTo: motivation,
        },
      }),
    ]);
  }

  revalidatePath(`/admin/students/${studentId}`);
  revalidatePath("/admin/students");
  redirect(`/admin/students/${studentId}?saved=motivation`);
}

const NOTE_KINDS = ["COMMENT", "PROGRESS", "ISSUE"] as const;
const MAX_NOTE_IMAGES = 3;

/** Adds a comment / progress note / issue to the student's activity log, optionally with screenshots. */
export async function addStudentNote(studentId: string, formData: FormData) {
  const { admin } = await requireAdminForStudent(studentId);
  const back = `/admin/students/${studentId}`;

  const body = String(formData.get("body") || "").trim();
  if (!body) redirect(`${back}?error=note`);
  if (body.length > 4000) redirect(`${back}?error=notelength`);

  const rawKind = String(formData.get("kind") || "COMMENT");
  const kind = (NOTE_KINDS as readonly string[]).includes(rawKind) ? (rawKind as (typeof NOTE_KINDS)[number]) : "COMMENT";

  const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_NOTE_IMAGES) redirect(`${back}?error=toomany`);
  const attachments: { fileName: string; contentType: string; fileSize: number; data: Buffer<ArrayBuffer> }[] = [];
  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_SIZE) redirect(`${back}?error=size`);
    const buffer = Buffer.from(new Uint8Array(await file.arrayBuffer()));
    const contentType = sniffImageContentType(buffer);
    if (!contentType) redirect(`${back}?error=filetype`);
    attachments.push({
      fileName: file.name.slice(0, 200) || "image",
      contentType,
      fileSize: buffer.length,
      data: buffer as Buffer<ArrayBuffer>,
    });
  }

  await prisma.studentNote.create({
    data: {
      studentId,
      authorId: admin.id,
      authorName: admin.username,
      authorRole: authorLabel(admin, formData.get("as")),
      kind,
      body,
      attachments: { create: attachments },
    },
  });

  revalidatePath(back);
  redirect(`${back}?saved=note`);
}

/** The writer of an entry, or the Super Admin, may remove it. */
export async function deleteStudentNote(studentId: string, formData: FormData) {
  const { admin } = await requireAdminForStudent(studentId);
  const noteId = String(formData.get("noteId") || "");
  const note = await prisma.studentNote.findFirst({ where: { id: noteId, studentId } });
  if (!note) notFound();
  if (admin.role !== "SUPER_ADMIN" && note.authorId !== admin.id) redirect(`/admin/students/${studentId}`);
  await prisma.studentNote.delete({ where: { id: note.id } });
  revalidatePath(`/admin/students/${studentId}`);
  redirect(`/admin/students/${studentId}`);
}

// ---------------------------------------------------------------------------
// Weekly class schedule (shown on the student's dashboard)
// ---------------------------------------------------------------------------

type ScheduleFields = {
  title: string;
  days: number[];
  startTime: string;
  endTime: string;
  room: string | null;
  tone: string;
  icon: string;
};

function parseScheduleFields(formData: FormData): ScheduleFields | null {
  const title = String(formData.get("title") ?? "").trim().slice(0, 60);
  const days = [
    ...new Set(
      formData
        .getAll("days")
        .map((d) => Number(d))
        .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7),
    ),
  ].sort((a, b) => a - b);
  const startTime = parseTime(formData.get("startTime"));
  const endTime = parseTime(formData.get("endTime"));
  const room = String(formData.get("room") ?? "").trim().slice(0, 60) || null;
  const tone = String(formData.get("tone") ?? "violet");
  const icon = String(formData.get("icon") ?? "book");
  if (!title || days.length === 0 || !startTime || !endTime) return null;
  return {
    title,
    days,
    startTime,
    endTime,
    room,
    tone: isTone(tone) ? tone : "violet",
    icon: isIcon(icon) ? icon : "book",
  };
}

export async function addScheduleEntry(studentId: string, formData: FormData) {
  await requireAdminForStudent(studentId);
  const back = `/admin/students/${studentId}?tab=schedule`;
  const fields = parseScheduleFields(formData);
  if (!fields) redirect(`${back}&error=schedule`);
  const count = await prisma.scheduleEntry.count({ where: { studentId } });
  if (count >= MAX_SCHEDULE_ENTRIES) redirect(`${back}&error=schedulefull`);
  await prisma.scheduleEntry.create({ data: { ...fields, studentId, sortOrder: count } });
  revalidatePath(`/admin/students/${studentId}`);
  revalidatePath("/dashboard");
  redirect(`${back}&saved=schedule`);
}

export async function updateScheduleEntry(studentId: string, formData: FormData) {
  await requireAdminForStudent(studentId);
  const back = `/admin/students/${studentId}?tab=schedule`;
  const entryId = String(formData.get("entryId") ?? "");
  const entry = await prisma.scheduleEntry.findFirst({ where: { id: entryId, studentId } });
  if (!entry) notFound();
  const fields = parseScheduleFields(formData);
  if (!fields) redirect(`${back}&error=schedule`);
  await prisma.scheduleEntry.update({ where: { id: entry.id }, data: fields });
  revalidatePath(`/admin/students/${studentId}`);
  revalidatePath("/dashboard");
  redirect(`${back}&saved=schedule`);
}

export async function deleteScheduleEntry(studentId: string, formData: FormData) {
  await requireAdminForStudent(studentId);
  const entryId = String(formData.get("entryId") ?? "");
  await prisma.scheduleEntry.deleteMany({ where: { id: entryId, studentId } });
  revalidatePath(`/admin/students/${studentId}`);
  revalidatePath("/dashboard");
  redirect(`/admin/students/${studentId}?tab=schedule&saved=scheduledeleted`);
}
