import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { updateBugReportStatus } from "../actions";

export default async function AdminBugReportDetailPage({
  params,
  searchParams,
}: PageProps<"/admin/bug-reports/[id]">) {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const { id } = await params;
  const search = await searchParams;
  const justSaved = search?.saved === "1";

  const report = await prisma.bugReport.findUnique({
    where: { id },
    include: {
      student: { select: { firstName: true, lastName: true, username: true } },
      attachments: { select: { id: true } },
    },
  });
  if (!report) notFound();

  const action = updateBugReportStatus.bind(null, report.id);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/bug-reports" className="text-sm text-rahoot-red hover:underline">
        &larr; Back to bug reports
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Bug Report</h1>

      <div className="card mt-6 flex flex-col gap-4 p-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-rahoot-muted">Student</p>
          <p className="font-semibold">
            {report.student.firstName} {report.student.lastName} (@{report.student.username})
          </p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-rahoot-muted">Description</p>
          <p className="whitespace-pre-wrap">{report.description}</p>
        </div>

        {report.attachments.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wide text-rahoot-muted">Screenshots</p>
            <div className="mt-2 flex gap-3">
              {report.attachments.map((a) => (
                <a key={a.id} href={`/attachments/${a.id}`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- served from a DB-backed, auth-gated route */}
                  <img
                    src={`/attachments/${a.id}`}
                    alt="Screenshot"
                    className="h-32 w-32 rounded-lg border border-rahoot-border object-cover hover:border-rahoot-red"
                  />
                </a>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs uppercase tracking-wide text-rahoot-muted">Submitted</p>
          <p>
            {report.createdAt.toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>

        <form action={action} className="flex flex-wrap items-end gap-3 border-t border-rahoot-border pt-4">
          <label className="text-sm font-semibold">
            Status
            <select name="status" defaultValue={report.status} className="input mt-1">
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </label>
          <button type="submit" className="btn btn-primary">
            Save Status
          </button>
          {justSaved && <p className="text-sm font-medium text-green-400">Status saved.</p>}
        </form>
      </div>
    </div>
  );
}
