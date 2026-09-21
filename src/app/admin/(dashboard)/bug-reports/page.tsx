import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";

const STATUS_INFO: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "Open", cls: "badge-neutral" },
  IN_PROGRESS: { label: "In Progress", cls: "badge-warning" },
  RESOLVED: { label: "Resolved", cls: "badge-success" },
};

export default async function AdminBugReportsPage({
  searchParams,
}: PageProps<"/admin/bug-reports">) {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const search = await searchParams;
  const statusFilter = typeof search?.status === "string" ? search.status : "";

  const [reports, counts] = await Promise.all([
    prisma.bugReport.findMany({
      where: statusFilter ? { status: statusFilter as "OPEN" | "IN_PROGRESS" | "RESOLVED" } : undefined,
      orderBy: { createdAt: "desc" },
      include: { student: { select: { firstName: true, lastName: true, username: true } } },
    }),
    prisma.bugReport.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const countByStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));

  return (
    <div>
      <h1 className="text-2xl font-bold">Bug Reports</h1>

      <div className="mt-4 grid grid-cols-3 gap-3 sm:w-fit">
        {(["OPEN", "IN_PROGRESS", "RESOLVED"] as const).map((s) => (
          <Link
            key={s}
            href={statusFilter === s ? "/admin/bug-reports" : `/admin/bug-reports?status=${s}`}
            className={`card p-4 text-center hover:border-rahoot-red ${statusFilter === s ? "border-rahoot-red" : ""}`}
          >
            <div className="text-2xl font-black">{countByStatus[s] ?? 0}</div>
            <div className="text-xs uppercase tracking-wide text-rahoot-muted">{STATUS_INFO[s].label}</div>
          </Link>
        ))}
      </div>

      {reports.length === 0 ? (
        <p className="mt-8 text-rahoot-muted">No bug reports{statusFilter ? " with this status" : ""} yet.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {reports.map((report) => {
            const status = STATUS_INFO[report.status];
            const title = report.description.length > 90 ? `${report.description.slice(0, 90)}…` : report.description;
            return (
              <li key={report.id}>
                <Link
                  href={`/admin/bug-reports/${report.id}`}
                  className="card flex items-center justify-between gap-3 p-4 hover:border-rahoot-red"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`badge ${status.cls}`}>{status.label}</span>
                      <span className="font-semibold">{title}</span>
                    </div>
                    <p className="mt-1 text-sm text-rahoot-muted">
                      {report.student.firstName} {report.student.lastName} (@{report.student.username}) &middot;{" "}
                      {report.createdAt.toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <span className="btn btn-outline shrink-0 !py-1.5 !px-3 text-sm">View Report</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
