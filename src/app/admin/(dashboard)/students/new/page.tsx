import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/session";
import { resolveAdminProgramScope } from "@/lib/programs";
import { createStudentFromForm } from "../actions";
import { StudentCreateForm } from "@/components/admin/students/StudentCreateForm";

const ERROR_MESSAGES: Record<string, string> = {
  missing: "First name, last name, and username are all required.",
  taken: "That username is already taken.",
  program: "Please choose a program.",
};

export default async function NewStudentPage({ searchParams }: PageProps<"/admin/students/new">) {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const search = await searchParams;
  const error = typeof search?.error === "string" ? ERROR_MESSAGES[search.error] ?? null : null;
  const requestedProgram = typeof search?.program === "string" ? search.program : undefined;
  const programId = await resolveAdminProgramScope(admin, requestedProgram);
  if (!programId) {
    return <p className="text-rahoot-muted">No programs exist yet - ask the Super Admin to create one.</p>;
  }

  // Super Admin may create a student in any program (the form switches the
  // subject list live); a regular Admin only ever sees their own program.
  const programs = await prisma.program.findMany({
    where: admin.role === "SUPER_ADMIN" ? {} : { id: programId },
    orderBy: { order: "asc" },
    select: {
      id: true,
      name: true,
      subjects: {
        orderBy: { order: "asc" },
        select: { id: true, name: true, groups: { orderBy: { order: "asc" }, select: { id: true, name: true } } },
      },
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <header className="sa-st-head !items-start">
        <svg className="sa-st-wave" viewBox="0 0 600 120" preserveAspectRatio="none" aria-hidden>
          <path d="M0 110 C 180 110, 280 20, 600 30" fill="none" strokeWidth="3" />
        </svg>
        <div className="relative min-w-0">
          <Link href={`/admin/students?program=${programId}`} className="inline-flex items-center gap-2 font-medium text-rahoot-ink hover:text-rahoot-red">
            <span aria-hidden>&larr;</span> Back to Students
          </Link>
          <h1 className="sa-pg-title !mt-3">Create Student</h1>
          <p className="mt-1 text-[1.05rem] text-rahoot-muted">
            Add a new student to the platform and assign their program, subjects and groups.
          </p>
        </div>
        <span className="sa-st-head-art" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" className="h-16 w-16">
            <circle cx="10" cy="8" r="3.75" />
            <path d="M3 20a7 7 0 0 1 11.5-5.4M18 14v6M15 17h6" />
          </svg>
        </span>
      </header>

      <StudentCreateForm
        action={createStudentFromForm}
        programs={programs}
        defaultProgramId={programId}
        canChooseProgram={admin.role === "SUPER_ADMIN"}
        error={error}
      />
    </div>
  );
}
