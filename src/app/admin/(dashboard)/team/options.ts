import "server-only";
import { prisma } from "@/lib/prisma";
import { ASSIGNABLE_STAFF_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/authz";
import type { StaffFormOptions } from "./StaffForm";

/** Everything the staff form can offer, across all programs (the form filters by the chosen program). */
export async function loadStaffFormOptions(includeLegacyAdmin: boolean): Promise<StaffFormOptions> {
  const [programs, subjects, students, cohorts, captains] = await Promise.all([
    prisma.program.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
    prisma.subject.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, name: true, programId: true, groups: { orderBy: { order: "asc" }, select: { id: true, name: true } } },
    }),
    prisma.user.findMany({
      where: { role: "STUDENT" },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, username: true, programId: true },
    }),
    prisma.cohort.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, programId: true, _count: { select: { members: true } } },
    }),
    prisma.user.findMany({
      where: { role: { in: ["JUNIOR_CAPTAIN", "MIDDLE_CAPTAIN"] } },
      orderBy: [{ firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, username: true, role: true, programId: true },
    }),
  ]);
  const name = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();
  return {
    programs,
    subjects,
    students: students.map((s) => ({ id: s.id, name: name(s), username: s.username, programId: s.programId ?? "" })),
    cohorts: cohorts.map((c) => ({ id: c.id, name: c.name, programId: c.programId, members: c._count.members })),
    captains: captains.map((c) => ({ id: c.id, name: name(c), username: c.username, role: c.role, programId: c.programId ?? "" })),
    roles: [
      ...(includeLegacyAdmin
        ? [{ value: "ADMIN" as const, label: "Keep legacy Admin", description: "Unchanged access until you pick a new role." }]
        : []),
      ...ASSIGNABLE_STAFF_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r], description: ROLE_DESCRIPTIONS[r] })),
    ],
  };
}
