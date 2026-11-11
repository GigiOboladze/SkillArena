import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { can, ROLE_LABELS } from "@/lib/authz";
import { incoScopeWhere, lecturerGroups, quizScopeWhere, studentScopeWhere, supervisedCaptainIds } from "@/lib/scope";
import { requestNow } from "@/lib/time-ago";
import type { User } from "@/generated/prisma/client";

const WEEK_MS = 7 * 24 * 3600 * 1000;

const INTRO: Partial<Record<User["role"], string>> = {
  LECTURER: "Your subject groups, their quizzes and academic notes.",
  JUNIOR_CAPTAIN: "Your students, their follow-ups and feedback.",
  MIDDLE_CAPTAIN: "Your cohort's progress, support notes, quizzes and HootArena.",
  SENIOR_CAPTAIN: "The captains you supervise and their students' progress.",
  SUCCESS_MANAGER: "Your program at a glance: students, feedback and INCO.",
};

/** Workspace home for every staff role below admin. Every number is computed inside the role's own scope. */
export async function StaffOverview({ staff }: { staff: User }) {
  const weekAgo = new Date(requestNow() - WEEK_MS);
  const scope = await studentScopeWhere(staff);

  const [studentCount, program, myOpenFollowUps, notesThisWeek, quizCount, incoNew, groups, captains, cohorts] = await Promise.all([
    prisma.user.count({ where: scope }),
    staff.programId ? prisma.program.findUnique({ where: { id: staff.programId }, select: { name: true } }) : null,
    prisma.studentNote.findMany({
      where: { authorId: staff.id, followUpAt: { not: null }, followUpDoneAt: null, student: scope },
      orderBy: { followUpAt: "asc" },
      take: 8,
      select: { id: true, body: true, followUpAt: true, student: { select: { id: true, firstName: true, lastName: true } } },
    }),
    prisma.studentNote.count({ where: { student: scope, createdAt: { gte: weekAgo } } }),
    can(staff, "quizzes.manage") ? quizScopeWhere(staff).then((where) => prisma.homework.count({ where })) : Promise.resolve(null),
    can(staff, "inco.view") ? prisma.incoSubmission.count({ where: { AND: [incoScopeWhere(staff), { status: "NEW" }] } }) : Promise.resolve(null),
    staff.role === "LECTURER"
      ? lecturerGroups(staff.id).then((g) =>
          prisma.group.findMany({
            where: { id: { in: g.map((x) => x.groupId) } },
            select: { id: true, name: true, subject: { select: { name: true } }, _count: { select: { studentMemberships: true } } },
          })
        )
      : Promise.resolve([]),
    staff.role === "SENIOR_CAPTAIN" ? supervisedCaptainIds(staff.id).then((ids) => ids.length) : Promise.resolve(null),
    staff.role === "MIDDLE_CAPTAIN"
      ? prisma.cohortCaptain.findMany({
          where: { captainId: staff.id },
          select: { cohort: { select: { name: true, _count: { select: { members: true } } } } },
        })
      : Promise.resolve([]),
  ]);

  const name = `${staff.firstName} ${staff.lastName}`.trim() || staff.username;
  const tiles: { label: string; value: string | number; href?: string }[] = [
    { label: "Students in your scope", value: studentCount, href: "/admin/my-students" },
    { label: "Your open follow-ups", value: myOpenFollowUps.length },
    { label: "Notes this week", value: notesThisWeek },
  ];
  if (quizCount !== null) tiles.push({ label: "Quizzes you manage", value: quizCount, href: "/admin/quizzes" });
  if (incoNew !== null) tiles.push({ label: "New INCO messages", value: incoNew, href: "/admin/inco" });
  if (captains !== null) tiles.push({ label: "Captains you supervise", value: captains, href: "/admin/supervision" });

  return (
    <div className="sa-st">
      <header className="sa-st-head">
        <div>
          <p className="sa-st-eyebrow">
            {ROLE_LABELS[staff.role]}
            {program ? ` · ${program.name}` : ""}
          </p>
          <h1>Welcome, {name}</h1>
          <p>{INTRO[staff.role] ?? ""}</p>
        </div>
      </header>

      <section className="sa-st-stats" aria-label="Summary">
        {tiles.map((t) =>
          t.href ? (
            <Link key={t.label} href={t.href} className="sa-st-stat is-link">
              <span>{t.label}</span>
              <strong>{t.value}</strong>
            </Link>
          ) : (
            <div key={t.label} className="sa-st-stat">
              <span>{t.label}</span>
              <strong>{t.value}</strong>
            </div>
          )
        )}
      </section>

      <div className="sa-st-layout">
        <section className="sa-st-section">
          <h2>Your follow-ups</h2>
          {myOpenFollowUps.length === 0 ? (
            <p className="sa-st-empty">Nothing waiting. Follow-ups you set on a note show up here.</p>
          ) : (
            <ul className="sa-st-list is-roomy">
              {myOpenFollowUps.map((n) => (
                <li key={n.id}>
                  <Link href={`/admin/my-students/${n.student.id}`} className="min-w-0">
                    <strong className="block truncate">{`${n.student.firstName} ${n.student.lastName}`.trim()}</strong>
                    <span className="block truncate text-sm text-rahoot-muted">{n.body}</span>
                  </Link>
                  <small className={n.followUpAt! < new Date(requestNow()) ? "sa-st-tone is-bad" : "sa-st-tone is-medium"}>
                    {n.followUpAt!.toISOString().slice(0, 10)}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="sa-st-side">
          {groups.length > 0 && (
            <section className="sa-st-card">
              <h2>Groups you teach</h2>
              <ul className="sa-st-list">
                {groups.map((g) => (
                  <li key={g.id}>
                    <span>
                      {g.subject.name} · {g.name}
                    </span>
                    <small>{g._count.studentMemberships} students</small>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {cohorts.length > 0 && (
            <section className="sa-st-card">
              <h2>Your cohort</h2>
              <ul className="sa-st-list">
                {cohorts.map((c) => (
                  <li key={c.cohort.name}>
                    <span>{c.cohort.name}</span>
                    <small>{c.cohort._count.members} students</small>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="sa-st-card">
            <h2>Shortcuts</h2>
            <div className="flex flex-col gap-2">
              <Link href="/admin/my-students" className="sa-st-link">My Students →</Link>
              {can(staff, "quizzes.manage") && <Link href="/admin/quizzes/new" className="sa-st-link">Create a quiz →</Link>}
              {can(staff, "hoot.host") && <Link href="/admin/hootarena/new" className="sa-st-link">Host HootArena →</Link>}
              {can(staff, "leaderboard.view") && <Link href="/admin/leaderboard" className="sa-st-link">Leaderboard →</Link>}
              {can(staff, "inco.view") && <Link href="/admin/inco" className="sa-st-link">INCO messages →</Link>}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
