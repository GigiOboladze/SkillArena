"use server";

import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/session";
import type { BugReportStatus } from "@/generated/prisma/client";

const VALID_STATUSES: BugReportStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED"];

export async function updateBugReportStatus(reportId: string, formData: FormData) {
  // Both admin levels manage bug reports - this is intentionally NOT
  // Super-Admin-gated, unlike admins/actions.ts.
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");

  const status = String(formData.get("status") || "");
  if (!VALID_STATUSES.includes(status as BugReportStatus)) return;

  // updateMany + count rather than update: a report deleted in the meantime
  // (its student was deleted) should 404 cleanly instead of throwing P2025.
  const { count } = await prisma.bugReport.updateMany({
    where: { id: reportId },
    data: { status: status as BugReportStatus },
  });
  if (count === 0) notFound();

  revalidatePath("/admin/bug-reports");
  revalidatePath(`/admin/bug-reports/${reportId}`);
  redirect(`/admin/bug-reports/${reportId}?saved=1`);
}
