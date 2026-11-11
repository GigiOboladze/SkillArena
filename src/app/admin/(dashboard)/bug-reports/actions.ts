"use server";

import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/session";
import { MAX_ATTACHMENTS, MAX_ATTACHMENT_SIZE, MAX_DESCRIPTION_LENGTH, sniffImageContentType } from "@/lib/bug-reports";
import type { BugReportPriority, BugReportStatus } from "@/generated/prisma/client";

const VALID_STATUSES: BugReportStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED"];
const VALID_PRIORITIES: BugReportPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export async function updateBugReportStatus(reportId: string, formData: FormData) {
  // Both admin levels manage bug reports - this is intentionally NOT
  // Super-Admin-gated, unlike admins/actions.ts.
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");

  const status = String(formData.get("status") || "");
  if (!VALID_STATUSES.includes(status as BugReportStatus)) return;
  // Priority is optional in the form (older clients only send status).
  const priorityRaw = String(formData.get("priority") || "");
  const priority = VALID_PRIORITIES.includes(priorityRaw as BugReportPriority) ? (priorityRaw as BugReportPriority) : undefined;

  // updateMany + count rather than update: a report deleted in the meantime
  // (its student was deleted) should 404 cleanly instead of throwing P2025.
  const { count } = await prisma.bugReport.updateMany({
    where: { id: reportId },
    data: { status: status as BugReportStatus, ...(priority ? { priority } : {}) },
  });
  if (count === 0) notFound();

  revalidatePath("/admin/bug-reports");
  revalidatePath(`/admin/bug-reports/${reportId}`);
  redirect(`/admin/bug-reports/${reportId}?saved=1`);
}

/**
 * An admin files a bug report themselves ("Report a Bug"). Same limits and
 * image checks as the student form; the reporter is the signed-in admin.
 */
export async function createAdminBugReport(formData: FormData) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  const back = "/admin/bug-reports/new";

  const description = String(formData.get("description") || "").trim();
  if (!description || description.length > MAX_DESCRIPTION_LENGTH) redirect(`${back}?error=description`);
  const priorityRaw = String(formData.get("priority") || "MEDIUM");
  const priority = VALID_PRIORITIES.includes(priorityRaw as BugReportPriority) ? (priorityRaw as BugReportPriority) : "MEDIUM";

  const files = formData.getAll("screenshots").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_ATTACHMENTS) redirect(`${back}?error=toomany`);
  const attachments: { fileName: string; contentType: string; fileSize: number; data: Buffer<ArrayBuffer> }[] = [];
  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_SIZE) redirect(`${back}?error=size`);
    const buffer = Buffer.from(new Uint8Array(await file.arrayBuffer()));
    const contentType = sniffImageContentType(buffer);
    if (!contentType) redirect(`${back}?error=filetype`);
    attachments.push({ fileName: file.name.slice(0, 200) || "screenshot", contentType, fileSize: buffer.length, data: buffer as Buffer<ArrayBuffer> });
  }

  await prisma.bugReport.create({
    data: { studentId: admin.id, description, priority, attachments: { create: attachments } },
  });
  revalidatePath("/admin/bug-reports");
  redirect("/admin/bug-reports?submitted=1");
}
