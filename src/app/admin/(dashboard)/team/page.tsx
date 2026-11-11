import { Select } from "@/components/ui/Select";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStaffWith } from "@/lib/staff-guard";
import { ROLE_LABELS, STAFF_ROLES, type StaffRole } from "@/lib/authz";
import type { Prisma } from "@/generated/prisma/client";

const PAGE_SIZE = 25;

function initials(first: string, last: string, username: string) {
  const s = `${first[0] ?? ""}${last[0] ?? ""}`.trim() || username.slice(0, 2);
  return s.toUpperCase();
}

/** Staff & Access Management - directory of every staff account. Super Admin only. No account limit. */
export default async function StaffDirectoryPage({ searchParams }: PageProps<"/admin/team">) {
  const superAdmin = await getStaffWith("staff.manage");
  if (!superAdmin) notFound();

  const search = await searchParams;
  const q = typeof search?.q === "string" ? search.q.trim().slice(0, 60) : "";
  const role = typeof search?.role === "string" && (STAFF_ROLES as readonly string[]).includes(search.role) ? (search.role as StaffRole) : "";
  const programId = typeof search?.program === "string" ? search.program : "";
  const status = search?.status === "active" || search?.status === "inactive" ? search.status : "";
  const page = Math.max(1, Number.parseInt(typeof search?.page === "string" ? search.page : "1", 10) || 1);

  const where: Prisma.UserWhereInput = { role: { not: "STUDENT" } };
  if (role) where.role = role;
  if (programId) where.programId = programId;
  if (status) where.isActive = status === "active";
  if (q) {
    where.OR = [
      { username: { contains: q.toLowerCase() } },
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
    ];
  }

  const [total, staff, programs, roleCounts, inactiveCount] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ role: "asc" }, { firstName: "asc" }, { username: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        role: true,
        isActive: true,
        program: { select: { name: true } },
        _count: {
          select: { lecturerAssignments: true, captainStudents: true, captainCohorts: true, supervisedCaptains: true },
        },
      },
    }),
    prisma.program.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
    prisma.user.groupBy({ by: ["role"], where: { role: { not: "STUDENT" } }, _count: { _all: true } }),
    prisma.user.count({ where: { role: { not: "STUDENT" }, isActive: false } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const countOf = (r: StaffRole) => roleCounts.find((c) => c.role === r)?._count._all ?? 0;
  const allStaff = roleCounts.reduce((n, c) => n + c._count._all, 0);
  const legacyAdmins = countOf("ADMIN");

  function scopeLabel(s: (typeof staff)[number]) {
    switch (s.role) {
      case "SUPER_ADMIN":
        return "Every program";
      case "ADMIN":
        return "Whole program (legacy)";
      case "LECTURER":
        return `${s._count.lecturerAssignments} subject group${s._count.lecturerAssignments === 1 ? "" : "s"}`;
      case "JUNIOR_CAPTAIN":
        return `${s._count.captainStudents} student${s._count.captainStudents === 1 ? "" : "s"}`;
      case "MIDDLE_CAPTAIN":
        return `${s._count.captainCohorts} cohort${s._count.captainCohorts === 1 ? "" : "s"}`;
      case "SENIOR_CAPTAIN":
        return `${s._count.supervisedCaptains} captain${s._count.supervisedCaptains === 1 ? "" : "s"}`;
      case "SUCCESS_MANAGER":
        return "Whole program";
      default:
        return "-";
    }
  }

  const qs = (over: Record<string, string | number>) => {
    const p = new URLSearchParams();
    const merged = { q, role, program: programId, status, page, ...over };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "page" && v === 1)) p.set(k, String(v));
    const s = p.toString();
    return s ? `/admin/team?${s}` : "/admin/team";
  };

  return (
    <div className="sa-st">
      <header className="sa-st-head">
        <div>
          <h1>Staff &amp; Access</h1>
          <p>Create staff accounts, give each one a role and a scope, and switch access off when someone leaves.</p>
        </div>
        <Link href="/admin/team/new" className="sa-st-primary">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="h-4 w-4" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add staff
        </Link>
      </header>

      <section className="sa-st-stats" aria-label="Summary">
        <div className="sa-st-stat">
          <span>Staff accounts</span>
          <strong>{allStaff}</strong>
        </div>
        <div className="sa-st-stat">
          <span>Lecturers</span>
          <strong>{countOf("LECTURER")}</strong>
        </div>
        <div className="sa-st-stat">
          <span>Captains</span>
          <strong>{countOf("JUNIOR_CAPTAIN") + countOf("MIDDLE_CAPTAIN") + countOf("SENIOR_CAPTAIN")}</strong>
        </div>
        <div className="sa-st-stat">
          <span>Deactivated</span>
          <strong>{inactiveCount}</strong>
        </div>
      </section>

      {legacyAdmins > 0 && (
        <p className="sa-st-alert is-info">
          {legacyAdmins} legacy Admin account{legacyAdmins === 1 ? " still has" : "s still have"} the old program-wide access.
          Open each one and give it one of the new roles when you are ready - nothing changes until you do.{" "}
          <Link href={qs({ role: "ADMIN", page: 1 })}>Show them</Link>
        </p>
      )}

      <form className="sa-st-filters" action="/admin/team" role="search">
        <input type="search" name="q" defaultValue={q} placeholder="Search name or username" aria-label="Search staff" className="sa-st-input" />
        <Select name="role" defaultValue={role} aria-label="Role" className="sa-st-input">
          <option value="">All roles</option>
          {STAFF_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
        <Select name="program" defaultValue={programId} aria-label="Program" className="sa-st-input">
          <option value="">All programs</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={status} aria-label="Status" className="sa-st-input">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="inactive">Deactivated</option>
        </Select>
        <button type="submit" className="sa-st-ghost">
          Filter
        </button>
      </form>

      <div className="sa-st-table" role="table" aria-label="Staff">
        <div className="sa-st-row is-head" role="row">
          <span role="columnheader">Name</span>
          <span role="columnheader">Role</span>
          <span role="columnheader">Program</span>
          <span role="columnheader">Scope</span>
          <span role="columnheader">Status</span>
          <span role="columnheader" className="sr-only">
            Actions
          </span>
        </div>
        {staff.length === 0 && (
          <p className="sa-st-empty is-table">{q || role || programId || status ? "No staff match these filters." : "No staff accounts yet."}</p>
        )}
        {staff.map((s) => {
          const editable = s.role !== "SUPER_ADMIN";
          return (
            <div key={s.id} className={`sa-st-row ${s.isActive ? "" : "is-off"}`} role="row">
              <span role="cell" className="sa-st-person">
                <span className="sa-st-avatar" aria-hidden>
                  {initials(s.firstName === "Admin" && !s.lastName ? "" : s.firstName, s.lastName, s.username)}
                </span>
                <span className="min-w-0">
                  <strong className="truncate">{`${s.firstName} ${s.lastName}`.trim() || s.username}</strong>
                  <small className="truncate">@{s.username}</small>
                </span>
              </span>
              <span role="cell">
                <span className={`sa-st-role-pill is-${s.role.toLowerCase()}`}>{ROLE_LABELS[s.role]}</span>
              </span>
              <span role="cell" className="sa-st-muted" data-label="Program">
                {s.program?.name ?? "All programs"}
              </span>
              <span role="cell" className="sa-st-muted" data-label="Scope">
                {scopeLabel(s)}
              </span>
              <span role="cell">
                <span className={`sa-st-status ${s.isActive ? "is-on" : "is-off"}`}>{s.isActive ? "Active" : "Deactivated"}</span>
              </span>
              <span role="cell" className="sa-st-cell-actions">
                {editable ? (
                  <Link href={`/admin/team/${s.id}`} className="sa-st-link">
                    Manage
                  </Link>
                ) : (
                  <span className="sa-st-muted text-xs">Protected</span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {pages > 1 && (
        <nav className="sa-st-pager" aria-label="Pages">
          {page > 1 ? <Link href={qs({ page: page - 1 })}>← Previous</Link> : <span />}
          <span>
            Page {page} of {pages} · {total} accounts
          </span>
          {page < pages ? <Link href={qs({ page: page + 1 })}>Next →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
