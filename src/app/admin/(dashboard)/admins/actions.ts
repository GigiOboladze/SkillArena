"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentSuperAdmin } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { MAX_ADMINS } from "@/lib/admin-constants";

// Every action here re-verifies Super Admin status itself - proxy.ts and the
// dashboard layout only prove "some admin is logged in", not which level.
// Regular admins must be rejected here even if they somehow reach this route
// or call the action directly.
async function requireSuperAdmin() {
  const superAdmin = await getCurrentSuperAdmin();
  if (!superAdmin) redirect("/admin");
  return superAdmin;
}

export async function createAdminAccount(formData: FormData) {
  await requireSuperAdmin();

  const username = String(formData.get("username") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  const programId = String(formData.get("programId") || "").trim();

  if (!username || username.length > 40) redirect("/admin/admins?error=username");
  if (password.length < 8) redirect("/admin/admins?error=weak");
  if (password !== confirmPassword) redirect("/admin/admins?error=mismatch");

  // Program assignment is mandatory for every regular Admin - never
  // optional, and never trusted without checking the row actually exists.
  const program = programId ? await prisma.program.findUnique({ where: { id: programId } }) : null;
  if (!program) redirect("/admin/admins?error=program");

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) redirect("/admin/admins?error=taken");

  // Re-checked as close to the write as practical - the 8-slot rule is
  // enforced here, server-side, not by disabling the "Create" button.
  const adminCount = await prisma.user.count({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } } });
  if (adminCount >= MAX_ADMINS) redirect("/admin/admins?error=full");

  const passwordHash = await hashPassword(password);
  // New admins are always created as regular ADMIN - SUPER_ADMIN is never
  // assignable through this form (or any other), which is what keeps the
  // "exactly one Super Admin" invariant true alongside the partial unique
  // index on the database.
  await prisma.user.create({
    data: { firstName: "Admin", lastName: "", username, passwordHash, role: "ADMIN", programId: program.id },
  });

  revalidatePath("/admin/admins");
  redirect("/admin/admins?created=1");
}

export async function changeAdminProgram(adminId: string, formData: FormData) {
  await requireSuperAdmin();

  // The `role: "ADMIN"` filter (never "SUPER_ADMIN") makes it structurally
  // impossible to reassign the Super Admin's program through this form,
  // even if their id were somehow submitted here.
  const admin = await prisma.user.findFirst({ where: { id: adminId, role: "ADMIN" } });
  if (!admin) redirect("/admin/admins");

  const programId = String(formData.get("programId") || "").trim();
  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program) redirect("/admin/admins?error=program");

  await prisma.user.update({ where: { id: adminId }, data: { programId: program.id } });

  revalidatePath("/admin/admins");
  redirect("/admin/admins?programChanged=1");
}

export async function deleteAdminAccount(adminId: string) {
  await requireSuperAdmin();

  // The `role: "ADMIN"` filter (never "SUPER_ADMIN") makes it structurally
  // impossible for this to remove the Super Admin, even if their own id were
  // somehow submitted here - not just a UI omission.
  await prisma.user.deleteMany({ where: { id: adminId, role: "ADMIN" } });

  revalidatePath("/admin/admins");
  redirect("/admin/admins");
}
