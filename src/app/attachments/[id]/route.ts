import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStudent, getCurrentAdmin } from "@/lib/session";

// Not covered by proxy.ts (it only guards /admin, /dashboard, /quiz), so
// this route authorizes itself: only the reporting student or any logged-in
// admin may fetch a given attachment's bytes. Everyone else gets a plain
// 404 - same response whether the id doesn't exist or access is denied, so
// this endpoint can't be used to probe which attachment ids are real.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const attachment = await prisma.bugReportAttachment.findUnique({
    where: { id },
    include: { bugReport: { select: { studentId: true } } },
  });
  if (!attachment) {
    return new NextResponse("Not found", { status: 404 });
  }

  const [student, admin] = await Promise.all([getCurrentStudent(), getCurrentAdmin()]);
  const isOwner = student?.id === attachment.bugReport.studentId;
  if (!isOwner && !admin) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(attachment.data, {
    headers: {
      "Content-Type": attachment.contentType,
      "Content-Length": String(attachment.fileSize),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
