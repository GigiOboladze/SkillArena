import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStaffWith } from "@/lib/staff-guard";
import { ROLE_LABELS } from "@/lib/authz";
import { requestNow } from "@/lib/time-ago";
import { studentScopeWhere } from "@/lib/scope";

const WEEK_MS = 7 * 24 * 3600 * 1000;

/** Senior Captain: the Junior and Middle Captains they supervise and what those captains have been doing. Read-only - no account administration. */
export default async function SupervisionPage() {
  const senior = await getStaffWith("captains.supervise");
  if (!senior) notFound();

  const weekAgo = new Date(requestNow() - WEEK_MS);
  const rows = await prisma.captainSupervision.findMany({
    where: { seniorId: senior.id, captain: { programId: senior.programId ?? "__none__" } },
    select: {
      captain: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          username: true,
          role: true,
          isActive: true,
          _count: { select: { captainStudents: true } },
          captainCohorts: { select: { cohort: { select: { name: true, _count: { select: { members: true } } } } } },
        },
      },
    },
  });
  const ids = rows.map((r) => r.captain.id);
  // Only notes about students currently inside the Senior Captain's own scope.
  const studentScope = await studentScopeWhere(senior);
  const [notesWeek, openFollowUps, lastNotes, recent] = await Promise.all([
    prisma.studentNote.groupBy({ by: ["authorId"], where: { authorId: { in: ids }, createdAt: { gte: weekAgo } }, _count: { _all: true } }),
    prisma.studentNote.groupBy({
      by: ["authorId"],
      where: { authorId: { in: ids }, followUpAt: { not: null }, followUpDoneAt: null },
      _count: { _all: true },
    }),
    prisma.studentNote.groupBy({ by: ["authorId"], where: { authorId: { in: ids } }, _max: { createdAt: true } }),
    prisma.studentNote.findMany({
      where: { authorId: { in: ids }, student: studentScope },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, kind: true, body: true, authorName: true, createdAt: true, student: { select: { id: true, firstName: true, lastName: true } } },
    }),
  ]);
  const by = <T extends { authorId: string | null }>(list: T[]) => new Map(list.map((x) => [x.authorId ?? "", x]));
  const weekBy = by(notesWeek);
  const openBy = by(openFollowUps);
  const lastBy = by(lastNotes);

  return (
    <div className="sa-st">
      <header className="sa-st-head">
        <div>
          <h1>Captains</h1>
          <p>The Junior and Middle Captains you supervise, their students and their recent activity.</p>
        </div>
      </header>

      <div className="sa-st-table is-captains" role="table" aria-label="Supervised captains">
        <div className="sa-st-row is-head" role="row">
          <span role="columnheader">Captain</span>
          <span role="columnheader">Role</span>
          <span role="columnheader">Looks after</span>
          <span role="columnheader">Notes (7 days)</span>
          <span role="columnheader">Open follow-ups</span>
          <span role="columnheader">Last activity</span>
        </div>
        {rows.length === 0 && <p className="sa-st-empty is-table">No captains assigned to you yet. The Super Admin sets this under Staff &amp; Access.</p>}
        {rows.map(({ captain: c }) => {
          const cohortStudents = c.captainCohorts.reduce((n, x) => n + x.cohort._count.members, 0);
          const looksAfter =
            c.role === "MIDDLE_CAPTAIN"
              ? `${c.captainCohorts.map((x) => x.cohort.name).join(", ") || "No cohort"} · ${cohortStudents} students`
              : `${c._count.captainStudents} students`;
          const last = lastBy.get(c.id)?._max.createdAt;
          return (
            <div key={c.id} className={`sa-st-row ${c.isActive ? "" : "is-off"}`} role="row">
              <span role="cell" className="sa-st-person">
                <span className="sa-st-avatar" aria-hidden>
                  {`${c.firstName[0] ?? ""}${c.lastName[0] ?? ""}`.toUpperCase() || c.username.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <strong className="truncate">{`${c.firstName} ${c.lastName}`.trim() || c.username}</strong>
                  <small className="truncate">@{c.username}</small>
                </span>
              </span>
              <span role="cell">
                <span className={`sa-st-role-pill is-${c.role.toLowerCase()}`}>{ROLE_LABELS[c.role]}</span>
              </span>
              <span role="cell" className="sa-st-muted" data-label="Looks after">{looksAfter}</span>
              <span role="cell" data-label="Notes (7 days)">{weekBy.get(c.id)?._count._all ?? 0}</span>
              <span role="cell" data-label="Open follow-ups">{openBy.get(c.id)?._count._all ?? 0}</span>
              <span role="cell" className="sa-st-muted" data-label="Last activity">{last ? last.toISOString().slice(0, 10) : "-"}</span>
            </div>
          );
        })}
      </div>

      <section className="sa-st-section">
        <h2>Latest captain notes</h2>
        {recent.length === 0 && <p className="sa-st-empty">Nothing written yet.</p>}
        <ol className="sa-st-notes">
          {recent.map((n) => (
            <li key={n.id} className="sa-st-note">
              <div className="sa-st-note-head">
                <strong>{n.authorName}</strong>
                <span className="sa-st-muted">
                  on{" "}
                  <Link href={`/admin/my-students/${n.student.id}`} className="sa-st-link">
                    {`${n.student.firstName} ${n.student.lastName}`.trim()}
                  </Link>{" "}
                  · {n.createdAt.toISOString().slice(0, 10)}
                </span>
              </div>
              <p className="line-clamp-2">{n.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
