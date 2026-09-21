"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin, createAdminSession, destroyAdminSession } from "@/lib/session";
import { hashPassword } from "@/lib/password";

async function requireAdmin() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

export async function updateAdminUsername(formData: FormData) {
  const admin = await requireAdmin();

  const username = String(formData.get("username") || "").trim().toLowerCase();
  if (!username || username.length > 40) redirect("/admin/profile?error=username");

  if (username !== admin.username) {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) redirect("/admin/profile?error=taken");

    await prisma.user.update({ where: { id: admin.id }, data: { username } });
    // The session envelope carries the username for display - refresh it so
    // the header/nav shows the new name without requiring a fresh login.
    // sessionVersion is unchanged (only a password change bumps it), so
    // this doesn't sign the admin's other sessions/devices out.
    await createAdminSession(admin.id, username, admin.sessionVersion);
  }

  redirect("/admin/profile?updated=username");
}

export async function updateAdminPassword(formData: FormData) {
  const admin = await requireAdmin();

  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (password.length < 8) redirect("/admin/profile?error=weak");
  if (password !== confirmPassword) redirect("/admin/profile?error=mismatch");

  const passwordHash = await hashPassword(password);
  // Bumping sessionVersion invalidates every session for this account, on
  // every device - not just this browser tab (see getAdminSession).
  await prisma.user.update({
    where: { id: admin.id },
    data: { passwordHash, sessionVersion: { increment: 1 } },
  });

  // Deliberately no "current password" check (per product requirement) - to
  // still make this safe, the change forces a fresh login on this session
  // immediately afterward rather than silently continuing on the old one.
  await destroyAdminSession();
  redirect("/admin/login?passwordChanged=1");
}
