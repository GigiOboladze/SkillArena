import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStaffWith } from "@/lib/staff-guard";
import { resolveAdminProgramScope, listPrograms } from "@/lib/programs";
import { createCohort } from "../team/actions";

const ERRORS: Record<string, string> = { name: "Give the cohort a name.", taken: "That program already has a cohort with this name." };

/** Cohorts: groups of students that move through a program together (what a Middle Captain runs). */
export default async function CohortsPage({ searchParams }: PageProps<"/admin/cohorts">) {
  const staff = await getStaffWith("programs.manage");
  if (!staff) notFound();
  const search = await searchParams;
  const programId = await resolveAdminProgramScope(staff, typeof search?.program === "string" ? search.program : undefined);
  if (!programId) return <p className="sa-st-empty">Create a program first.</p>;
  const error = typeof search?.error === "string" ? ERRORS[search.error] : null;

  const [programs, cohorts, unassigned] = await Promise.all([
    listPrograms(),
    prisma.cohort.findMany({
      where: { programId },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { members: true } },
        captains: { include: { captain: { select: { firstName: true, lastName: true, username: true } } } },
      },
    }),
    prisma.user.count({ where: { role: "STUDENT", programId, cohortMembership: null } }),
  ]);

  return (
    <div className="sa-st">
      <header className="sa-st-head">
        <div>
          <h1>Cohorts</h1>
          <p>A cohort is the set of students who move through a program together. Middle Captains are assigned to cohorts - not to subject groups.</p>
        </div>
      </header>

      <div className="sa-st-tabs" role="tablist" aria-label="Program">
        {programs.map((p) => (
          <Link key={p.id} href={`/admin/cohorts?program=${p.id}`} role="tab" aria-selected={p.id === programId} className={p.id === programId ? "is-on" : ""}>
            {p.name}
          </Link>
        ))}
      </div>

      {error && <p className="sa-st-alert is-error" role="alert">{error}</p>}

      <form action={createCohort} className="sa-st-inline">
        <input type="hidden" name="programId" value={programId} />
        <input name="name" required maxLength={60} placeholder="New cohort name, e.g. Autumn 2026" aria-label="New cohort name" className="sa-st-input" />
        <button type="submit" className="sa-st-primary">Create cohort</button>
      </form>

      <p className="sa-st-hint">{unassigned} student{unassigned === 1 ? " is" : "s are"} not in any cohort yet.</p>

      <div className="sa-st-cards">
        {cohorts.length === 0 && <p className="sa-st-empty">No cohorts in this program yet.</p>}
        {cohorts.map((c) => (
          <Link key={c.id} href={`/admin/cohorts/${c.id}`} className="sa-st-card is-link">
            <h2>{c.name}</h2>
            <p>{c._count.members} student{c._count.members === 1 ? "" : "s"}</p>
            <p className="sa-st-muted">
              {c.captains.length
                ? `Captain: ${c.captains.map((x) => `${x.captain.firstName} ${x.captain.lastName}`.trim() || x.captain.username).join(", ")}`
                : "No Middle Captain yet"}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
