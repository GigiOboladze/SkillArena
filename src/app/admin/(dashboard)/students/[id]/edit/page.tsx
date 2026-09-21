import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/session";
import { listSubjectsWithGroups } from "@/lib/subjects";
import { updateStudent } from "../../actions";
import { SubjectGroupFields } from "../../SubjectGroupFields";

const ERROR_MESSAGES: Record<string, string> = {
  missing: "First name, last name, and username are all required.",
  taken: "That username is already taken.",
};

export default async function EditStudentPage({
  params,
  searchParams,
}: PageProps<"/admin/students/[id]/edit">) {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const { id } = await params;
  const search = await searchParams;
  const error = typeof search?.error === "string" ? ERROR_MESSAGES[search.error] ?? null : null;

  const student = await prisma.user.findFirst({
    where: { id, role: "STUDENT" },
    include: { subjectGroups: true },
  });
  if (!student) notFound();
  if (admin.role !== "SUPER_ADMIN" && student.programId !== admin.programId) notFound();
  if (!student.programId) notFound();

  const subjects = await listSubjectsWithGroups(student.programId);
  const currentAssignments = Object.fromEntries(student.subjectGroups.map((sg) => [sg.subjectId, sg.groupId]));
  const action = updateStudent.bind(null, student.id);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/students" className="text-sm text-rahoot-red hover:underline">
        &larr; Back to students
      </Link>
      <h1 className="mt-2 text-2xl font-bold">
        Edit {student.firstName} {student.lastName}
      </h1>

      <form action={action} className="card mt-6 flex flex-col gap-4 p-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">
            First name
            <input name="firstName" required maxLength={80} defaultValue={student.firstName} className="input mt-1" />
          </label>
          <label className="text-sm font-semibold">
            Last name
            <input name="lastName" required maxLength={80} defaultValue={student.lastName} className="input mt-1" />
          </label>
          <label className="text-sm font-semibold sm:col-span-2">
            Username
            <input
              name="username"
              required
              maxLength={40}
              autoCapitalize="off"
              defaultValue={student.username}
              className="input mt-1"
            />
          </label>
        </div>

        <SubjectGroupFields subjects={subjects} currentAssignments={currentAssignments} />

        {error && <p className="text-sm font-medium text-rahoot-red">{error}</p>}
        <button type="submit" className="btn btn-primary self-start">
          Save changes
        </button>
      </form>
    </div>
  );
}
