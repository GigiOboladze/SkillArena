import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentSuperAdmin } from "@/lib/session";
import { createSubject } from "../actions";

const ERROR_MESSAGES: Record<string, string> = {
  name: "Please enter a subject name.",
  taken: "A subject with that name already exists in this program.",
};

export default async function ProgramDetailPage({
  params,
  searchParams,
}: PageProps<"/admin/programs/[id]">) {
  const superAdmin = await getCurrentSuperAdmin();
  if (!superAdmin) notFound();

  const { id } = await params;
  const search = await searchParams;
  const error = typeof search?.error === "string" ? ERROR_MESSAGES[search.error] ?? null : null;
  const justCreated = search?.created === "1";

  const program = await prisma.program.findUnique({
    where: { id },
    include: { subjects: { orderBy: { order: "asc" }, include: { groups: { orderBy: { order: "asc" } } } } },
  });
  if (!program) notFound();

  const addSubject = createSubject.bind(null, program.id);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/programs" className="text-sm text-rahoot-red hover:underline">
          &larr; Back to programs
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{program.name}</h1>
        <p className="mt-1 text-sm text-rahoot-muted">
          {program.groupCount} fixed group{program.groupCount === 1 ? "" : "s"} per subject
        </p>
      </div>

      {justCreated && <p className="text-sm font-medium text-green-400">Subject added.</p>}

      <section>
        <h2 className="font-bold">
          Subjects <span className="font-normal text-rahoot-muted">({program.subjects.length})</span>
        </h2>
        {program.subjects.length === 0 ? (
          <p className="mt-3 text-sm text-rahoot-muted">No subjects yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {program.subjects.map((subject) => (
              <li key={subject.id} className="card p-4">
                <p className="font-semibold">{subject.name}</p>
                <p className="mt-1 text-sm text-rahoot-muted">
                  Groups: {subject.groups.map((g) => g.name.replace(/^Group /, "")).join(", ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-6">
        <h2 className="font-bold">Add a subject</h2>
        <p className="mt-1 text-sm text-rahoot-muted">
          Every subject automatically gets this program&apos;s {program.groupCount} fixed group
          {program.groupCount === 1 ? "" : "s"} - groups can&apos;t be renamed, added, or removed.
        </p>
        <form action={addSubject} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex-1 text-sm font-semibold sm:min-w-[16rem] sm:flex-none">
            Subject name
            <input name="name" required maxLength={120} className="input mt-1" />
          </label>
          <button type="submit" className="btn btn-primary">
            Add subject
          </button>
        </form>
        {error && <p className="mt-3 text-sm font-medium text-rahoot-red">{error}</p>}
      </section>
    </div>
  );
}
