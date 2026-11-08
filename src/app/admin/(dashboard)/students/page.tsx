import Link from "next/link";
import { parseHobbies } from "@/lib/hobbies";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/session";
import { resetStudentPassword, deleteStudent } from "./actions";
import { DeleteStudentButton } from "./DeleteStudentButton";
import { listSubjectsWithGroups } from "@/lib/subjects";
import { resolveAdminProgramScope, listPrograms } from "@/lib/programs";
import { readPasswordFlash } from "@/lib/password-flash";
import { getProgramStudentStats } from "@/lib/student-stats";
import { Avatar } from "@/components/student/Avatar";
import { IconCheck, IconPlus, IconStar, IconTrophy, IconUsers } from "@/components/student/Icons";
import { AccuracyRing, Stars } from "@/components/admin/students/Stars";
import type { Prisma } from "@/generated/prisma/client";

const PAGE_SIZE = 12;
const SORTS = {
  rank: "Leaderboard position",
  name: "Name (A-Z)",
  newest: "Newest first",
  motivation: "Lowest motivation",
} as const;
type SortKey = keyof typeof SORTS;

export default async function AdminStudentsPage({ searchParams }: PageProps<"/admin/students">) {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const search = await searchParams;
  const createdUsername = typeof search?.created === "string" ? search.created : null;
  // Retrieved from a short-lived server-side store via an opaque token - the
  // password itself never travels in the URL. See src/lib/password-flash.ts.
  const createdPassword = readPasswordFlash(typeof search?.pw === "string" ? search.pw : null);
  const q = typeof search?.q === "string" ? search.q.trim() : "";
  const subjectId = typeof search?.subject === "string" ? search.subject : "";
  const sort: SortKey = typeof search?.sort === "string" && search.sort in SORTS ? (search.sort as SortKey) : "rank";
  const requestedPage = Math.max(1, Number(typeof search?.page === "string" ? search.page : 1) || 1);
  const requestedProgram = typeof search?.program === "string" ? search.program : undefined;

  const programId = await resolveAdminProgramScope(admin, requestedProgram);
  if (!programId) {
    return <p className="text-rahoot-muted">No programs exist yet - ask the Super Admin to create one.</p>;
  }

  const where: Prisma.UserWhereInput = { role: "STUDENT", programId };
  if (q) {
    where.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { username: { contains: q, mode: "insensitive" } },
    ];
  }
  if (subjectId) where.subjectGroups = { some: { subjectId } };

  const [students, programStudentCount, subjects, programs, programStats] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        hobby: true,
        communicationSkill: true,
        motivation: true,
        createdAt: true,
      },
    }),
    prisma.user.count({ where: { role: "STUDENT", programId } }),
    listSubjectsWithGroups(programId),
    admin.role === "SUPER_ADMIN" ? listPrograms() : Promise.resolve([]),
    getProgramStudentStats(programId),
  ]);

  const { stats, board, totalPoints, averageAccuracy } = programStats;
  const lastRank = board.length + 1;
  const sorted = [...students].sort((a, b) => {
    if (sort === "name") return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    if (sort === "newest") return b.createdAt.getTime() - a.createdAt.getTime();
    if (sort === "motivation") return (a.motivation ?? 101) - (b.motivation ?? 101);
    return (stats.get(a.id)?.rank ?? lastRank) - (stats.get(b.id)?.rank ?? lastRank);
  });
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const visible = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const top = board[0];

  const pageHref = (n: number) => {
    const params = new URLSearchParams();
    if (admin.role === "SUPER_ADMIN") params.set("program", programId);
    if (q) params.set("q", q);
    if (subjectId) params.set("subject", subjectId);
    if (sort !== "rank") params.set("sort", sort);
    if (n > 1) params.set("page", String(n));
    const qs = params.toString();
    return `/admin/students${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ---------------- Header ---------------- */}
      <header className="sa-st-head">
        <svg className="sa-st-wave" viewBox="0 0 600 120" preserveAspectRatio="none" aria-hidden>
          <path d="M0 110 C 180 110, 280 20, 600 30" fill="none" strokeWidth="3" />
        </svg>
        <div className="relative min-w-0">
          <h1 className="sa-pg-title !mt-0">Students</h1>
          <p className="mt-1 text-[1.05rem] text-rahoot-muted">
            Manage your students, view their progress, skills and standings.
          </p>
        </div>
        <Link href={`/admin/students/new?program=${programId}`} className="sa-qz-new relative">
          <IconPlus className="h-5 w-5" />
          Create student
        </Link>
      </header>

      {createdUsername && createdPassword && (
        <div className="sa-panel border-2 !border-rahoot-red p-4">
          <p className="font-semibold">
            Credentials for <span className="font-mono">{createdUsername}</span>
          </p>
          <p className="mt-1 text-sm text-rahoot-muted">
            Password: <span className="font-mono text-rahoot-ink">{createdPassword}</span>
          </p>
          <p className="mt-2 text-xs text-rahoot-muted">
            This is shown once - write it down now. The student can log in at /login.
          </p>
        </div>
      )}

      {/* ---------------- Summary ---------------- */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="sa-st-stat">
          <span className="sa-st-stat-icon is-violet">
            <IconUsers className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="sa-st-stat-value">{programStudentCount.toLocaleString()}</p>
            <p className="sa-st-stat-label">Total students</p>
          </div>
        </div>
        <div className="sa-st-stat">
          <span className="sa-st-stat-icon is-green">
            <IconCheck className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="sa-st-stat-value">{averageAccuracy === null ? "-" : `${averageAccuracy}%`}</p>
            <p className="sa-st-stat-label">Avg. quiz accuracy</p>
          </div>
        </div>
        <div className="sa-st-stat">
          <span className="sa-st-stat-icon is-gold">
            <IconTrophy className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="sa-st-stat-value truncate">{top && top.totalScore > 0 ? `${top.firstName} ${top.lastName.charAt(0)}.` : "-"}</p>
            <p className="sa-st-stat-label">Top performer</p>
          </div>
        </div>
        <div className="sa-st-stat">
          <span className="sa-st-stat-icon is-violet">
            <IconStar className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="sa-st-stat-value">{totalPoints.toLocaleString()}</p>
            <p className="sa-st-stat-label">Total points</p>
          </div>
        </div>
      </div>

      {/* ---------------- Filters ---------------- */}
      <form method="get" className="sa-st-filters">
        <label className="sa-qz-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden className="h-5 w-5 flex-none text-rahoot-muted">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
          <span className="sr-only">Search by name or username</span>
          <input type="search" name="q" defaultValue={q} placeholder="Search by name or username&hellip;" />
        </label>
        {admin.role === "SUPER_ADMIN" && programs.length > 1 ? (
          <select name="program" defaultValue={programId} className="sa-qz-select" aria-label="Program">
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : (
          admin.role === "SUPER_ADMIN" && <input type="hidden" name="program" value={programId} />
        )}
        <select name="subject" defaultValue={subjectId} className="sa-qz-select" aria-label="Subject">
          <option value="">All subjects</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select name="sort" defaultValue={sort} className="sa-qz-select" aria-label="Sort by">
          {Object.entries(SORTS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="submit" className="sa-qz-filter">
          Apply
        </button>
      </form>

      {/* ---------------- Cards ---------------- */}
      {visible.length === 0 ? (
        <p className="text-rahoot-muted">{q || subjectId ? "No students match." : "No students yet - create the first one."}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {visible.map((student) => {
            const st = stats.get(student.id);
            const name = `${student.firstName} ${student.lastName}`;
            return (
              <li key={student.id} className="sa-st-card">
                {/* Whole-card link sits underneath; the menu and its buttons sit above it. */}
                <Link href={`/admin/students/${student.id}`} className="sa-st-cover" aria-label={`Open ${name}`} />
                <div className="sa-st-card-top">
                  <Avatar seed={student.id} firstName={student.firstName} lastName={student.lastName} size={84} className="sa-avatar-tile" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-bold">{name}</p>
                    <p className="truncate text-sm text-rahoot-muted">{`@${student.username}`}</p>
                    {(() => {
                      const hobbies = parseHobbies(student.hobby);
                      if (hobbies.length === 0) return null;
                      return (
                        <span className="sa-st-hobby" title={hobbies.join(", ")}>
                          {hobbies[0]}
                          {hobbies.length > 1 ? ` +${hobbies.length - 1}` : ""}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      {st && <span className="sa-st-rank">#{st.rank}</span>}
                      <details className="sa-menu">
                        <summary aria-label={`Actions for ${name}`}>
                          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
                            <circle cx="5.5" cy="12" r="1.7" />
                            <circle cx="12" cy="12" r="1.7" />
                            <circle cx="18.5" cy="12" r="1.7" />
                          </svg>
                        </summary>
                        <div className="sa-menu-panel">
                          <Link href={`/admin/students/${student.id}`}>Open profile</Link>
                          <Link href={`/admin/students/${student.id}/edit`}>Edit details</Link>
                          <form action={resetStudentPassword}>
                            <input type="hidden" name="studentId" value={student.id} />
                            <button type="submit">Reset password</button>
                          </form>
                          <form action={deleteStudent}>
                            <input type="hidden" name="studentId" value={student.id} />
                            <DeleteStudentButton name={name} className="is-danger" />
                          </form>
                        </div>
                      </details>
                    </div>
                    <p className="whitespace-nowrap text-lg font-bold">
                      {(st?.points ?? 0).toLocaleString()} <span className="text-sm font-medium text-rahoot-muted">AP</span>
                    </p>
                  </div>
                </div>
                <div className="sa-st-card-stats">
                  <div>
                    <p className="text-sm text-rahoot-muted">Communication</p>
                    <p className="mt-1 flex items-center gap-2">
                      <span className="font-bold">{student.communicationSkill ? student.communicationSkill.toFixed(1) : "-"}</span>
                      <Stars value={student.communicationSkill} />
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-rahoot-muted">Quiz accuracy</p>
                    <p className="mt-1 flex items-center gap-2">
                      <AccuracyRing value={st?.accuracy ?? null} />
                      <span className="font-bold">{st?.accuracy === null || st?.accuracy === undefined ? "-" : `${st.accuracy}%`}</span>
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* ---------------- Pagination ---------------- */}
      {pageCount > 1 && (
        <nav className="sa-pager" aria-label="Pages">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} aria-label="Previous page">
              &lsaquo;
            </Link>
          ) : (
            <span aria-hidden>&lsaquo;</span>
          )}
          {pageNumbers(page, pageCount).map((n, i) =>
            n === null ? (
              <span key={`gap-${i}`} className="is-gap">
                &hellip;
              </span>
            ) : (
              <Link key={n} href={pageHref(n)} className={n === page ? "is-active" : undefined} aria-current={n === page ? "page" : undefined}>
                {n}
              </Link>
            )
          )}
          {page < pageCount ? (
            <Link href={pageHref(page + 1)} aria-label="Next page">
              &rsaquo;
            </Link>
          ) : (
            <span aria-hidden>&rsaquo;</span>
          )}
        </nav>
      )}
    </div>
  );
}

/** 1 2 3 ... 13 style page list (null = gap). */
function pageNumbers(page: number, count: number): (number | null)[] {
  const wanted = new Set([1, count, page - 1, page, page + 1].filter((n) => n >= 1 && n <= count));
  if (page <= 3) [2, 3].forEach((n) => n <= count && wanted.add(n));
  const list = [...wanted].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  list.forEach((n, i) => {
    if (i > 0 && n - list[i - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
}
