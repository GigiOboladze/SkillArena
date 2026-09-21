import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/session";
import { createStudent, resetStudentPassword, deleteStudent } from "./actions";
import { DeleteStudentButton } from "./DeleteStudentButton";
import { SubjectGroupFields } from "./SubjectGroupFields";
import { listSubjectsWithGroups } from "@/lib/subjects";
import { resolveAdminProgramScope, listPrograms } from "@/lib/programs";
import { ProgramSelector } from "@/components/ProgramSelector";
import type { Prisma } from "@/generated/prisma/client";

const ERROR_MESSAGES: Record<string, string> = {
  missing: "First name, last name, and username are all required.",
  taken: "That username is already taken.",
};

export default async function AdminStudentsPage({
  searchParams,
}: PageProps<"/admin/students">) {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const search = await searchParams;
  const error = typeof search?.error === "string" ? ERROR_MESSAGES[search.error] ?? null : null;
  const createdUsername = typeof search?.created === "string" ? search.created : null;
  const createdPassword = typeof search?.password === "string" ? search.password : null;
  const q = typeof search?.q === "string" ? search.q.trim() : "";
  const subjectId = typeof search?.subject === "string" ? search.subject : "";
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
  if (subjectId) {
    where.subjectGroups = { some: { subjectId } };
  }

  const [students, subjects, programs] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      include: {
        _count: { select: { quizAttempts: true } },
        subjectGroups: { include: { subject: true, group: true } },
      },
    }),
    listSubjectsWithGroups(programId),
    admin.role === "SUPER_ADMIN" ? listPrograms() : Promise.resolve([]),
  ]);

  const createStudentInProgram = createStudent.bind(null, programId);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Students</h1>
          <p className="mt-1 text-sm text-rahoot-muted">
            Create accounts here and hand the credentials to your students - there's no public sign-up.
          </p>
        </div>
        {admin.role === "SUPER_ADMIN" && (
          <ProgramSelector programs={programs} currentProgramId={programId} basePath="/admin/students" />
        )}
      </div>

      {createdUsername && createdPassword && (
        <div className="card border-2 border-rahoot-red p-4">
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

      <section className="card p-6">
        <h2 className="font-bold">Add a student</h2>
        <form action={createStudentInProgram} className="mt-4 flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">
              First name
              <input name="firstName" required maxLength={80} className="input mt-1" />
            </label>
            <label className="text-sm font-semibold">
              Last name
              <input name="lastName" required maxLength={80} className="input mt-1" />
            </label>
            <label className="text-sm font-semibold">
              Username
              <input name="username" required maxLength={40} autoCapitalize="off" className="input mt-1" />
            </label>
            <label className="text-sm font-semibold">
              Password <span className="font-normal text-rahoot-muted">(leave blank to auto-generate)</span>
              <input name="password" maxLength={80} className="input mt-1" />
            </label>
          </div>

          <SubjectGroupFields subjects={subjects} />

          {error && <p className="text-sm font-medium text-rahoot-red">{error}</p>}
          <button type="submit" className="btn btn-primary self-start">
            Create student
          </button>
        </form>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold">
            All students <span className="font-normal text-rahoot-muted">({students.length})</span>
          </h2>
          <form className="flex gap-2" method="get">
            {admin.role === "SUPER_ADMIN" && <input type="hidden" name="program" value={programId} />}
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search name or username&hellip;"
              className="input !py-1.5 text-sm sm:w-56"
            />
            <select name="subject" defaultValue={subjectId} className="input !py-1.5 text-sm sm:w-40">
              <option value="">All subjects</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-outline !py-1.5 !px-3 text-sm">
              Filter
            </button>
          </form>
        </div>

        {students.length === 0 ? (
          <p className="mt-4 text-sm text-rahoot-muted">No students match.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {students.map((student) => {
              const resetPassword = resetStudentPassword.bind(null, student.id);
              const remove = deleteStudent.bind(null, student.id);
              return (
                <li key={student.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <Link
                      href={`/admin/students/${student.id}`}
                      className="font-semibold hover:text-rahoot-red hover:underline"
                    >
                      {student.firstName} {student.lastName}
                    </Link>
                    <p className="text-sm text-rahoot-muted">
                      @{student.username} &middot; {student._count.quizAttempts} attempt
                      {student._count.quizAttempts === 1 ? "" : "s"}
                      {student.subjectGroups.length > 0 && (
                        <>
                          {" "}
                          &middot;{" "}
                          {student.subjectGroups
                            .map((sg) => `${sg.subject.name}: ${sg.group?.name ?? "no group yet"}`)
                            .join(", ")}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/admin/students/${student.id}/edit`} className="btn btn-outline !py-1.5 !px-3 text-sm">
                      Edit
                    </Link>
                    <form action={resetPassword}>
                      <button type="submit" className="btn btn-outline !py-1.5 !px-3 text-sm">
                        Reset password
                      </button>
                    </form>
                    <form action={remove}>
                      <DeleteStudentButton name={`${student.firstName} ${student.lastName}`} />
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
