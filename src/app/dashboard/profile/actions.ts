"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentStudent, createStudentUserSession, destroyStudentUserSession } from "@/lib/session";
import { hashPassword } from "@/lib/password";

async function requireStudent() {
  const student = await getCurrentStudent();
  if (!student) redirect("/login");
  return student;
}

export async function updateStudentUsername(formData: FormData) {
  const student = await requireStudent();

  const username = String(formData.get("username") || "").trim().toLowerCase();
  if (!username || username.length > 40) redirect("/dashboard/profile?error=username");

  if (username !== student.username) {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) redirect("/dashboard/profile?error=taken");

    await prisma.user.update({ where: { id: student.id }, data: { username } });
    // The session envelope carries the username for display - refresh it so
    // the header shows the new name without requiring a fresh login.
    // sessionVersion is unchanged (only a password change bumps it), so
    // this doesn't sign the student's other sessions/devices out.
    await createStudentUserSession(student.id, username, student.sessionVersion);
  }

  redirect("/dashboard/profile?updated=username");
}

export async function updateStudentPassword(formData: FormData) {
  const student = await requireStudent();

  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (password.length < 8) redirect("/dashboard/profile?error=weak");
  if (password !== confirmPassword) redirect("/dashboard/profile?error=mismatch");

  const passwordHash = await hashPassword(password);
  // Bumping sessionVersion invalidates every session for this account, on
  // every device - not just this browser tab (see getStudentUserSession).
  await prisma.user.update({
    where: { id: student.id },
    data: { passwordHash, sessionVersion: { increment: 1 } },
  });

  // No "current password" check, per product requirement - to still make
  // this safe, the change forces a fresh login on this session immediately
  // afterward rather than silently continuing on the old one.
  await destroyStudentUserSession();
  redirect("/login?passwordChanged=1");
}
