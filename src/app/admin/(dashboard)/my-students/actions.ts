"use server";

import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getStaffWith } from "@/lib/staff-guard";
import { canViewStudent } from "@/lib/scope";
import { ROLE_LABELS } from "@/lib/authz";
import { WRITABLE_NOTE_KINDS } from "@/lib/note-meta";

const MAX_NOTE_LENGTH = 4000;

/** Staff member allowed to write notes AND allowed to see this particular student - anything else is a 404. */
async function requireNoteAccess(studentId: string) {
  const staff = await getStaffWith("notes.write");
  if (!staff) redirect("/login");
  if (!(await canViewStudent(staff, studentId))) notFound();
  return staff;
}

/**
 * Adds a note to a student's record. Notes are append-only: a new note never
 * overwrites an earlier one, and there is no edit or delete here. The
 * author's name and role are copied onto the row so history stays readable
 * after the account is renamed or its role changes.
 */
export async function addStudentNote(studentId: string, formData: FormData) {
  const staff = await requireNoteAccess(studentId);
  const rawKind = String(formData.get("kind") || "COMMENT");
  const kind = (WRITABLE_NOTE_KINDS as readonly string[]).includes(rawKind)
    ? (rawKind as (typeof WRITABLE_NOTE_KINDS)[number])
    : "COMMENT";
  const body = String(formData.get("body") || "").trim();
  if (!body) redirect(`/admin/my-students/${studentId}?error=empty`);
  if (body.length > MAX_NOTE_LENGTH) redirect(`/admin/my-students/${studentId}?error=long`);

  const followUpRaw = String(formData.get("followUpAt") || "");
  let followUpAt: Date | null = null;
  if (followUpRaw) {
    const d = new Date(`${followUpRaw}T09:00:00`);
    if (Number.isNaN(d.getTime())) redirect(`/admin/my-students/${studentId}?error=date`);
    followUpAt = d;
  }

  await prisma.studentNote.create({
    data: {
      studentId,
      authorId: staff.id,
      authorName: `${staff.firstName} ${staff.lastName}`.trim() || staff.username,
      authorRole: ROLE_LABELS[staff.role],
      kind,
      body,
      followUpAt,
    },
  });
  revalidatePath(`/admin/my-students/${studentId}`);
  redirect(`/admin/my-students/${studentId}?noted=1`);
}

/** Marks a note's follow-up as done (the note itself is unchanged). */
export async function completeFollowUp(noteId: string) {
  const note = await prisma.studentNote.findUnique({ where: { id: noteId }, select: { studentId: true, followUpAt: true } });
  if (!note) notFound();
  await requireNoteAccess(note.studentId);
  if (note.followUpAt) {
    await prisma.studentNote.update({ where: { id: noteId }, data: { followUpDoneAt: new Date() } });
  }
  revalidatePath(`/admin/my-students/${note.studentId}`);
  revalidatePath("/admin");
  redirect(`/admin/my-students/${note.studentId}`);
}
