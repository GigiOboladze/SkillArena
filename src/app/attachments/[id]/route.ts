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

  // Ownership metadata first, image bytes only once access is confirmed - an
  // unauthorized or anonymous request no longer makes the database read (and
  // ship to Node) up to 3MB of image data just to be told "404".
  const [meta, student, admin] = await Promise.all([
    prisma.bugReportAttachment.findUnique({
      where: { id },
      select: { contentType: true, fileSize: true, bugReport: { select: { studentId: true } } },
    }),
    getCurrentStudent(),
    getCurrentAdmin(),
  ]);
  if (!meta) {
    return new NextResponse("Not found", { status: 404 });
  }

  const isOwner = student?.id === meta.bugReport.studentId;
  if (!isOwner && !admin) {
    return new NextResponse("Not found", { status: 404 });
  }

  const attachment = await prisma.bugReportAttachment.findUnique({ where: { id }, select: { data: true } });
  if (!attachment) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(attachment.data, {
    headers: {
      "Content-Type": meta.contentType,
      "Content-Length": String(meta.fileSize),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
