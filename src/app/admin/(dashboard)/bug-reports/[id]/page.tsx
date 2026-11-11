import { Select } from "@/components/ui/Select";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { BUG_PRIORITY, BUG_STATUS, type BugPriorityKey, type BugStatusKey } from "@/lib/bug-report-meta";
import { IconBugSolid } from "@/components/admin/BugIcons";
import { updateBugReportStatus } from "../actions";

export default async function AdminBugReportDetailPage({ params, searchParams }: PageProps<"/admin/bug-reports/[id]">) {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const { id } = await params;
  const search = await searchParams;
  const justSaved = search?.saved === "1";

  const report = await prisma.bugReport.findUnique({
    where: { id },
    include: {
      student: { select: { firstName: true, lastName: true, username: true, role: true } },
      attachments: { select: { id: true } },
    },
  });
  if (!report) notFound();

  const action = updateBugReportStatus.bind(null, report.id);
  const st = BUG_STATUS[report.status];
  const pr = BUG_PRIORITY[report.priority];
  const when = report.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="sa-br mx-auto flex w-full max-w-3xl flex-col gap-5">
      <Link href="/admin/bug-reports" className="sa-mp-back self-start">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
        Back to bug reports
      </Link>
      <div className="flex flex-wrap items-center gap-4">
        <span className={`sa-br-row-icon is-${st.tone} !h-14 !w-14`} aria-hidden>
          <IconBugSolid className="h-8 w-8" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-black tracking-tight">Bug Report</h1>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <span className={`sa-br-badge is-${st.tone}`}>{st.label}</span>
            <span className={`sa-br-badge is-${pr.tone} is-outline`}>{pr.label} priority</span>
          </div>
        </div>
      </div>

      <section className="sa-br-panel flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="sa-mp-dt">Reported by</p>
            <p className="mt-1 font-semibold">
              {report.student.firstName} {report.student.lastName} (@{report.student.username})
              {report.student.role !== "STUDENT" ? " · Admin" : ""}
            </p>
          </div>
          <div>
            <p className="sa-mp-dt">Submitted</p>
            <p className="mt-1 font-semibold">{when}</p>
          </div>
        </div>
        <div>
          <p className="sa-mp-dt">Description</p>
          <p className="mt-1 whitespace-pre-wrap break-words">{report.description}</p>
        </div>
        {report.attachments.length > 0 && (
          <div>
            <p className="sa-mp-dt">Screenshots</p>
            <div className="mt-2 flex flex-wrap gap-3">
              {report.attachments.map((a) => (
                <a key={a.id} href={`/attachments/${a.id}`} target="_blank" rel="noreferrer" className="sa-br-thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element -- served from a DB-backed, auth-gated route */}
                  <img src={`/attachments/${a.id}`} alt="Screenshot" />
                </a>
              ))}
            </div>
          </div>
        )}

        <form action={action} className="flex flex-wrap items-end gap-3 border-t border-[var(--sa-panel-border)] pt-5">
          <label className="sa-mp-field">
            <span>Status</span>
            <Select name="status" defaultValue={report.status} className="sa-br-select">
              {(Object.keys(BUG_STATUS) as BugStatusKey[]).map((s) => (
                <option key={s} value={s}>
                  {BUG_STATUS[s].label}
                </option>
              ))}
            </Select>
          </label>
          <label className="sa-mp-field">
            <span>Priority</span>
            <Select name="priority" defaultValue={report.priority} className="sa-br-select">
              {(Object.keys(BUG_PRIORITY) as BugPriorityKey[]).map((p) => (
                <option key={p} value={p}>
                  {BUG_PRIORITY[p].label}
                </option>
              ))}
            </Select>
          </label>
          <button type="submit" className="sa-br-primary">
            Save Status
          </button>
          {justSaved && <p className="text-sm font-medium text-green-400">Saved.</p>}
        </form>
      </section>
    </div>
  );
}
