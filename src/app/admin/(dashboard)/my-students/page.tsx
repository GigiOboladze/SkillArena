import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStaffWith } from "@/lib/staff-guard";
import { isFullAdmin, ROLE_LABELS } from "@/lib/authz";
import { studentScopeWhere } from "@/lib/scope";
import { getProgramStudentStats, motivationLevel } from "@/lib/student-stats";
import type { Prisma } from "@/generated/prisma/client";

const PAGE_SIZE = 30;

const SCOPE_TEXT: Partial<Record<string, string>> = {
  LECTURER: "Students in the subject groups you teach.",
  JUNIOR_CAPTAIN: "Students assigned to you.",
  MIDDLE_CAPTAIN: "Students in your cohort.",
  SENIOR_CAPTAIN: "Students of the captains you supervise.",
  SUCCESS_MANAGER: "Every student in your program.",
};

/** Scoped student directory for every staff role below admin. Only students inside the role's scope are ever queried. */
export default async function MyStudentsPage({ searchParams }: PageProps<"/admin/my-students">) {
  const staff = await getStaffWith("students.view");
  if (!staff) notFound();
  // Super Admin / legacy Admin have the full Students area instead.
  if (isFullAdmin(staff)) redirect("/admin/students");

  const search = await searchParams;
  const q = typeof search?.q === "string" ? search.q.trim().slice(0, 60) : "";
  const page = Math.max(1, Number.parseInt(typeof search?.page === "string" ? search.page : "1", 10) || 1);

  const scope = await studentScopeWhere(staff);
  const where: Prisma.UserWhereInput = q
    ? {
        AND: [
          scope,
          {
            OR: [
              { username: { contains: q.toLowerCase() } },
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
            ],
          },
        ],
      }
    : scope;

  const [total, students, openFollowUps, stats] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        motivation: true,
        cohortMembership: { select: { cohort: { select: { name: true } } } },
        studentNotes: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
    }),
    prisma.studentNote.groupBy({
      by: ["studentId"],
      where: { student: scope, followUpAt: { not: null }, followUpDoneAt: null },
      _count: { _all: true },
    }),
    staff.programId ? getProgramStudentStats(staff.programId) : Promise.resolve(null),
  ]);
  const followUpsBy = new Map(openFollowUps.map((f) => [f.studentId, f._count._all]));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => `/admin/my-students?${new URLSearchParams({ ...(q ? { q } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <div className="sa-st">
      <header className="sa-st-head">
        <div>
          <h1>My Students</h1>
          <p>
            {SCOPE_TEXT[staff.role] ?? ""} <span className="sa-st-muted">({ROLE_LABELS[staff.role]})</span>
          </p>
        </div>
      </header>

      <form className="sa-st-filters" action="/admin/my-students" role="search">
        <input type="search" name="q" defaultValue={q} placeholder="Search name or username" aria-label="Search students" className="sa-st-input" />
        <button type="submit" className="sa-st-ghost">
          Search
        </button>
      </form>

      <div className="sa-st-table is-students" role="table" aria-label="Students">
        <div className="sa-st-row is-head" role="row">
          <span role="columnheader">Student</span>
          <span role="columnheader">Cohort</span>
          <span role="columnheader">ArenaPoints</span>
          <span role="columnheader">Motivation</span>
          <span role="columnheader">Follow-ups</span>
          <span role="columnheader">Last note</span>
        </div>
        {students.length === 0 && (
          <p className="sa-st-empty is-table">
            {q ? "No students match this search." : "No students in your scope yet. The Super Admin assigns them under Staff & Access."}
          </p>
        )}
        {students.map((s) => {
          const level = motivationLevel(s.motivation);
          const st = stats?.stats.get(s.id);
          const open = followUpsBy.get(s.id) ?? 0;
          return (
            <Link key={s.id} href={`/admin/my-students/${s.id}`} className="sa-st-row is-link" role="row">
              <span role="cell" className="sa-st-person">
                <span className="sa-st-avatar" aria-hidden>
                  {`${s.firstName[0] ?? ""}${s.lastName[0] ?? ""}`.toUpperCase()}
                </span>
                <span className="min-w-0">
                  <strong className="truncate">{`${s.firstName} ${s.lastName}`.trim()}</strong>
                  <small className="truncate">@{s.username}</small>
                </span>
              </span>
              <span role="cell" className="sa-st-muted" data-label="Cohort">
                {s.cohortMembership?.cohort.name ?? "-"}
              </span>
              <span role="cell" data-label="ArenaPoints">
                {st?.points ?? 0}
              </span>
              <span role="cell" data-label="Motivation">
                {level ? <span className={`sa-st-tone is-${level.tone}`}>{s.motivation}% · {level.label}</span> : <span className="sa-st-muted">-</span>}
              </span>
              <span role="cell" data-label="Follow-ups">
                {open ? <span className="sa-st-tone is-medium">{open} open</span> : <span className="sa-st-muted">None</span>}
              </span>
              <span role="cell" className="sa-st-muted" data-label="Last note">
                {s.studentNotes[0] ? s.studentNotes[0].createdAt.toISOString().slice(0, 10) : "-"}
              </span>
            </Link>
          );
        })}
      </div>

      {pages > 1 && (
        <nav className="sa-st-pager" aria-label="Pages">
          {page > 1 ? <Link href={href(page - 1)}>← Previous</Link> : <span />}
          <span>
            Page {page} of {pages} · {total} students
          </span>
          {page < pages ? <Link href={href(page + 1)}>Next →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
