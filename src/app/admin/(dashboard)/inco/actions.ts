"use server";

import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentSuperAdmin } from "@/lib/session";
import type { IncoStatus } from "@/generated/prisma/client";

// Every action here re-verifies Super Admin status itself, the same as
// admin-management's requireSuperAdmin - proxy.ts and the dashboard layout
// only prove "some admin is logged in", not which level, and a regular
// Admin must be rejected here even if they somehow reach this route or call
// the action directly. This is the actual enforcement; the admin nav simply
// not showing an "INCO" link to a regular Admin is not what makes this safe.
async function requireSuperAdmin() {
  const superAdmin = await getCurrentSuperAdmin();
  if (!superAdmin) redirect("/admin");
  return superAdmin;
}

const VALID_STATUSES: IncoStatus[] = ["NEW", "IN_PROGRESS", "RESOLVED"];

export async function updateIncoStatus(id: string, status: string) {
  await requireSuperAdmin();
  if (!VALID_STATUSES.includes(status as IncoStatus)) return;

  const submission = await prisma.incoSubmission.findUnique({ where: { id } });
  if (!submission) notFound();

  await prisma.incoSubmission.update({ where: { id }, data: { status: status as IncoStatus } });
  revalidatePath(`/admin/inco/${id}`);
  revalidatePath("/admin/inco");
}

export async function respondToInco(id: string, formData: FormData) {
  await requireSuperAdmin();

  const submission = await prisma.incoSubmission.findUnique({ where: { id } });
  if (!submission) notFound();

  const response = String(formData.get("response") || "").trim();
  if (!response) redirect(`/admin/inco/${id}?error=empty`);

  await prisma.incoSubmission.update({
    where: { id },
    data: {
      response,
      respondedAt: new Date(),
      // Answering implicitly moves a still-NEW submission along, without
      // forcing the admin to also click a separate status button.
      status: submission.status === "NEW" ? "IN_PROGRESS" : submission.status,
    },
  });

  revalidatePath(`/admin/inco/${id}`);
  revalidatePath("/admin/inco");
  redirect(`/admin/inco/${id}?responded=1`);
}
