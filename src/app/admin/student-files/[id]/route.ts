import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/session";

// Images attached to a student's activity log. Admin-only (proxy.ts already
// requires an admin session for /admin), and a regular Admin only for
// students in their own program. Same 404 for "missing" and "not allowed".
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [meta, admin] = await Promise.all([
    prisma.studentNoteAttachment.findUnique({
      where: { id },
      select: { contentType: true, fileSize: true, note: { select: { student: { select: { programId: true } } } } },
    }),
    getCurrentAdmin(),
  ]);
  if (!meta || !admin) return new NextResponse("Not found", { status: 404 });
  if (admin.role !== "SUPER_ADMIN" && meta.note.student.programId !== admin.programId) {
    return new NextResponse("Not found", { status: 404 });
  }
  const file = await prisma.studentNoteAttachment.findUnique({ where: { id }, select: { data: true } });
  if (!file) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(file.data, {
    headers: {
      "Content-Type": meta.contentType,
      "Content-Length": String(meta.fileSize),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
