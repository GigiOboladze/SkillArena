"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentStudent } from "@/lib/session";
import { MAX_ATTACHMENTS, MAX_ATTACHMENT_SIZE, MAX_DESCRIPTION_LENGTH, sniffImageContentType } from "@/lib/bug-reports";

export async function submitBugReport(formData: FormData) {
  const student = await getCurrentStudent();
  if (!student) redirect("/login");

  const description = String(formData.get("description") || "").trim();
  if (!description) redirect("/dashboard/bug-reports/new?error=description");
  if (description.length > MAX_DESCRIPTION_LENGTH) redirect("/dashboard/bug-reports/new?error=description");

  const files = formData.getAll("screenshots").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_ATTACHMENTS) redirect("/dashboard/bug-reports/new?error=toomany");

  // `Buffer<ArrayBuffer>`, not the bare `Buffer` alias - Prisma's generated
  // input type for a Bytes field is that specific instantiation, and a plain
  // `Buffer` annotation defaults to the wider `Buffer<ArrayBufferLike>`.
  const attachments: { fileName: string; contentType: string; fileSize: number; data: Buffer<ArrayBuffer> }[] = [];
  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_SIZE) redirect("/dashboard/bug-reports/new?error=size");

    const buffer = Buffer.from(new Uint8Array(await file.arrayBuffer()));
    // The real content, not the filename/extension or the browser-supplied
    // File.type, decides whether this is actually an image.
    const contentType = sniffImageContentType(buffer);
    if (!contentType) redirect("/dashboard/bug-reports/new?error=filetype");

    attachments.push({
      fileName: file.name.slice(0, 200) || "screenshot",
      contentType,
      fileSize: buffer.length,
      data: buffer as Buffer<ArrayBuffer>,
    });
  }

  // Ownership is always the session's own student id - the client never
  // supplies (and could not override) who a report belongs to.
  await prisma.bugReport.create({
    data: {
      studentId: student.id,
      description,
      attachments: { create: attachments },
    },
  });

  revalidatePath("/dashboard/bug-reports");
  redirect("/dashboard/bug-reports?submitted=1");
}
