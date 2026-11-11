import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStaffWith } from "@/lib/staff-guard";
import { renameCohort, setCohortMembers } from "../../team/actions";

export default async function CohortPage({ params, searchParams }: PageProps<"/admin/cohorts/[id]">) {
  const staff = await getStaffWith("programs.manage");
  if (!staff) notFound();
  const { id } = await params;
  const search = await searchParams;
  const cohort = await prisma.cohort.findUnique({ where: { id }, include: { program: { select: { name: true } } } });
  if (!cohort) notFound();

  const students = await prisma.user.findMany({
    where: { role: "STUDENT", programId: cohort.programId },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: { id: true, firstName: true, lastName: true, username: true, cohortMembership: { select: { cohortId: true, cohort: { select: { name: true } } } } },
  });
  const memberCount = students.filter((s) => s.cohortMembership?.cohortId === cohort.id).length;
  const rename = renameCohort.bind(null, cohort.id);
  const saveMembers = setCohortMembers.bind(null, cohort.id);

  return (
    <div className="sa-st">
      <nav className="sa-st-crumbs" aria-label="Breadcrumb">
        <Link href={`/admin/cohorts?program=${cohort.programId}`}>Cohorts</Link>
        <span aria-hidden>/</span>
        <span>{cohort.name}</span>
      </nav>
      <header className="sa-st-head">
        <div>
          <h1>{cohort.name}</h1>
          <p>{cohort.program.name} · {memberCount} student{memberCount === 1 ? "" : "s"}</p>
        </div>
      </header>
      {search?.saved === "1" && <p className="sa-st-alert is-ok" role="status">Saved.</p>}
      {search?.error === "taken" && <p className="sa-st-alert is-error" role="alert">That name is already used in this program.</p>}

      <form action={rename} className="sa-st-inline">
        <input name="name" required maxLength={60} defaultValue={cohort.name} aria-label="Cohort name" className="sa-st-input" />
        <button type="submit" className="sa-st-ghost">Rename</button>
      </form>

      <form action={saveMembers} className="sa-st-section">
        <p className="sa-st-hint">Tick the students in this cohort. A student can be in one cohort - ticking someone from another cohort moves them here.</p>
        <div className="sa-st-checklist is-tall">
          {students.length === 0 && <p className="sa-st-empty">No students in this program.</p>}
          {students.map((s) => {
            const other = s.cohortMembership && s.cohortMembership.cohortId !== cohort.id ? s.cohortMembership.cohort.name : null;
            return (
              <label key={s.id} className="sa-st-check">
                <input type="checkbox" name="studentIds" value={s.id} defaultChecked={s.cohortMembership?.cohortId === cohort.id} />
                <span>{`${s.firstName} ${s.lastName}`.trim()}</span>
                <small>@{s.username}{other ? ` · now in ${other}` : ""}</small>
              </label>
            );
          })}
        </div>
        <div className="sa-st-actions">
          <button type="submit" className="sa-st-primary">Save members</button>
        </div>
      </form>
    </div>
  );
}
