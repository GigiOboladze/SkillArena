import type React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { BUG_PRIORITY, BUG_STATUS, type BugPriorityKey, type BugStatusKey } from "@/lib/bug-report-meta";
import { AutoSubmitSelect } from "@/components/admin/AutoSubmitSelect";
import { BugEmptyArt, BugHeroArt, IconBugSolid, IconCheckCircle, IconClockSolid } from "@/components/admin/BugIcons";

const STATUS_KEYS = Object.keys(BUG_STATUS) as BugStatusKey[];
const PRIORITY_KEYS = Object.keys(BUG_PRIORITY) as BugPriorityKey[];

function formatWhen(d: Date) {
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default async function AdminBugReportsPage({ searchParams }: PageProps<"/admin/bug-reports">) {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const search = await searchParams;
  const status = STATUS_KEYS.includes(search?.status as BugStatusKey) ? (search?.status as BugStatusKey) : "";
  const priority = PRIORITY_KEYS.includes(search?.priority as BugPriorityKey) ? (search?.priority as BugPriorityKey) : "";
  const q = typeof search?.q === "string" ? search.q.trim().slice(0, 100) : "";
  const submitted = search?.submitted === "1";
  const filtered = Boolean(status || priority || q);

  const where: Prisma.BugReportWhereInput = {
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(q
      ? {
          OR: [
            { description: { contains: q, mode: "insensitive" } },
            { student: { firstName: { contains: q, mode: "insensitive" } } },
            { student: { lastName: { contains: q, mode: "insensitive" } } },
            { student: { username: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [reports, counts] = await Promise.all([
    prisma.bugReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        student: { select: { firstName: true, lastName: true, username: true, role: true } },
        _count: { select: { attachments: true } },
      },
    }),
    prisma.bugReport.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const countByStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Partial<Record<BugStatusKey, number>>;
  const total = counts.reduce((sum, c) => sum + c._count._all, 0);

  // Keep the other filters when a stat card toggles the status.
  const statusHref = (s: BugStatusKey) => {
    const params = new URLSearchParams();
    if (status !== s) params.set("status", s);
    if (priority) params.set("priority", priority);
    if (q) params.set("q", q);
    const qs = params.toString();
    return qs ? `/admin/bug-reports?${qs}` : "/admin/bug-reports";
  };

  const STAT_ICONS: Record<BugStatusKey, React.ReactNode> = {
    OPEN: <IconBugSolid className="h-8 w-8" />,
    IN_PROGRESS: <IconClockSolid className="h-8 w-8" />,
    RESOLVED: <IconCheckCircle className="h-8 w-8" />,
  };

  return (
    <div className="sa-br flex flex-col gap-6">
      {/* ---------------- Header ---------------- */}
      <header className="sa-br-head">
        <span className="sa-br-head-icon" aria-hidden>
          <IconBugSolid className="h-9 w-9" />
        </span>
        <div className="relative z-10 min-w-0">
          <h1 className="text-3xl font-black tracking-tight sm:text-[2.6rem] sm:leading-tight">Bug Reports</h1>
          <p className="mt-1 text-rahoot-muted sm:text-[1.05rem]">Track, manage, and resolve issues reported across SkillArena.</p>
        </div>
        <BugHeroArt className="sa-br-art" />
      </header>

      {submitted && <p className="text-sm font-medium text-green-400">Bug report submitted.</p>}

      {/* ---------------- Stats ---------------- */}
      <section className="sa-br-stats" aria-label="Bug reports by status">
        {STATUS_KEYS.map((s) => (
          <Link
            key={s}
            href={statusHref(s)}
            className={`sa-br-stat is-${BUG_STATUS[s].tone} ${status === s ? "is-selected" : ""}`}
            aria-pressed={status === s}
            aria-label={`${countByStatus[s] ?? 0} ${BUG_STATUS[s].label} - ${status === s ? "show all" : "filter"}`}
          >
            <span className="sa-br-stat-icon" aria-hidden>
              {STAT_ICONS[s]}
            </span>
            <span className="min-w-0">
              <span className="block text-3xl font-black leading-none tabular-nums">{countByStatus[s] ?? 0}</span>
              <span className="sa-br-stat-label">{BUG_STATUS[s].label}</span>
            </span>
          </Link>
        ))}
      </section>

      {/* ---------------- Filters ---------------- */}
      <form method="get" className="sa-br-filters" role="search">
        <label className="sa-br-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5 flex-none text-rahoot-muted" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input name="q" defaultValue={q} placeholder="Search bug reports..." aria-label="Search bug reports" />
        </label>
        <div className="sa-br-filter-right">
          <AutoSubmitSelect name="status" defaultValue={status} ariaLabel="Filter by status" className="sa-br-select">
            <option value="">All Status</option>
            {STATUS_KEYS.map((s) => (
              <option key={s} value={s}>
                {BUG_STATUS[s].label}
              </option>
            ))}
          </AutoSubmitSelect>
          <AutoSubmitSelect name="priority" defaultValue={priority} ariaLabel="Filter by priority" className="sa-br-select">
            <option value="">All Priority</option>
            {PRIORITY_KEYS.map((p) => (
              <option key={p} value={p}>
                {BUG_PRIORITY[p].label}
              </option>
            ))}
          </AutoSubmitSelect>
          <button type="submit" className="sr-only">
            Search
          </button>
          <Link href="/admin/bug-reports/new" className="sa-br-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className="h-5 w-5" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            Report a Bug
          </Link>
        </div>
      </form>

      {/* ---------------- List / empty ---------------- */}
      {reports.length === 0 ? (
        <section className="sa-br-empty">
          <BugEmptyArt className="h-36 w-auto" />
          {filtered && total > 0 ? (
            <>
              <h2 className="mt-4 text-2xl font-black">No bug reports match.</h2>
              <p className="mt-2 max-w-md text-rahoot-muted">Try a different search, or clear the filters to see every report.</p>
              <Link href="/admin/bug-reports" className="sa-br-primary mt-6">
                Clear filters
              </Link>
            </>
          ) : (
            <>
              <h2 className="mt-4 text-2xl font-black sm:text-[1.75rem]">No bug reports yet.</h2>
              <p className="mt-2 max-w-md text-rahoot-muted">
                Reported issues will appear here, where you can track their status and work on a resolution.
              </p>
              <Link href="/admin/bug-reports/new" className="sa-br-primary mt-6">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className="h-5 w-5" aria-hidden>
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Report the First Bug
              </Link>
            </>
          )}
        </section>
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.map((report) => {
            const st = BUG_STATUS[report.status];
            const pr = BUG_PRIORITY[report.priority];
            const title = report.description.length > 140 ? `${report.description.slice(0, 140)}…` : report.description;
            const byAdmin = report.student.role !== "STUDENT";
            return (
              <li key={report.id} className="sa-br-row">
                <span className={`sa-br-row-icon is-${st.tone}`} aria-hidden>
                  {report.status === "RESOLVED" ? <IconCheckCircle className="h-6 w-6" /> : report.status === "IN_PROGRESS" ? <IconClockSolid className="h-6 w-6" /> : <IconBugSolid className="h-6 w-6" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`sa-br-badge is-${st.tone}`}>{st.label}</span>
                    <span className={`sa-br-badge is-${pr.tone} is-outline`}>{pr.label} priority</span>
                    {report._count.attachments > 0 && (
                      <span className="text-xs font-semibold text-rahoot-muted">
                        {report._count.attachments} screenshot{report._count.attachments === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 line-clamp-2 break-words font-semibold">{title}</p>
                  <p className="mt-1 text-sm text-rahoot-muted">
                    {report.student.firstName} {report.student.lastName} (@{report.student.username})
                    {byAdmin ? " · Admin" : ""} &middot; {formatWhen(report.createdAt)}
                  </p>
                </div>
                <Link href={`/admin/bug-reports/${report.id}`} className="sa-br-view">
                  View Report
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
