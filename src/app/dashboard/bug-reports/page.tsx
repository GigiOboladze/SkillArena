import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStudent } from "@/lib/session";
import { prisma } from "@/lib/prisma";

const STATUS_INFO: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "● Open", cls: "badge-neutral" },
  IN_PROGRESS: { label: "● In Progress", cls: "badge-warning" },
  RESOLVED: { label: "✓ Resolved", cls: "badge-success" },
};

export default async function StudentBugReportsPage({
  searchParams,
}: PageProps<"/dashboard/bug-reports">) {
  const student = await getCurrentStudent();
  if (!student) redirect("/login");

  const search = await searchParams;
  const justSubmitted = search?.submitted === "1";

  // Ownership filter is on the session's own id - a student can never list
  // (or, via the /attachments route, view) another student's report.
  const reports = await prisma.bugReport.findMany({
    where: { studentId: student.id },
    orderBy: { createdAt: "desc" },
    include: { attachments: { select: { id: true } } },
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">My Bug Reports</h1>
        <Link href="/dashboard/bug-reports/new" className="btn btn-primary">
          Report a Bug
        </Link>
      </div>

      {justSubmitted && (
        <p className="mt-3 text-sm font-medium text-green-400">Bug report submitted successfully.</p>
      )}

      {reports.length === 0 ? (
        <p className="mt-8 text-rahoot-muted">You haven&apos;t reported anything yet.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {reports.map((report) => {
            const status = STATUS_INFO[report.status];
            const title = report.description.length > 90 ? `${report.description.slice(0, 90)}…` : report.description;
            return (
              <li key={report.id} className="card p-4">
                <p className="font-semibold">{title}</p>
                <div className="mt-2 flex items-center justify-between text-sm text-rahoot-muted">
                  <span>
                    {report.createdAt.toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  <span className={`badge ${status.cls}`}>{status.label}</span>
                </div>
                {report.attachments.length > 0 && (
                  <div className="mt-3 flex gap-2">
                    {report.attachments.map((a) => (
                      // eslint-disable-next-line @next/next/no-img-element -- served from a DB-backed, auth-gated route, not a static/optimizable asset
                      <img
                        key={a.id}
                        src={`/attachments/${a.id}`}
                        alt="Screenshot"
                        className="h-16 w-16 rounded-lg border border-rahoot-border object-cover"
                      />
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
