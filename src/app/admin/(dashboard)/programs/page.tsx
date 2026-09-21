import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentSuperAdmin } from "@/lib/session";
import { createProgram } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  name: "Please enter a program name.",
  taken: "A program with that name already exists.",
};

export default async function ProgramsPage({
  searchParams,
}: PageProps<"/admin/programs">) {
  // Not just hidden from nav - a regular admin hitting this URL directly gets a 404.
  const superAdmin = await getCurrentSuperAdmin();
  if (!superAdmin) notFound();

  const search = await searchParams;
  const error = typeof search?.error === "string" ? ERROR_MESSAGES[search.error] ?? null : null;
  const justCreated = search?.created === "1";

  const programs = await prisma.program.findMany({
    orderBy: { order: "asc" },
    include: { _count: { select: { subjects: true, users: true } } },
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Programs</h1>
        <p className="mt-1 text-sm text-rahoot-muted">
          Every student and Admin belongs to exactly one program. Programs are never deleted once created.
        </p>
      </div>

      {justCreated && <p className="text-sm font-medium text-green-400">Program created.</p>}

      <ul className="flex flex-col gap-2">
        {programs.map((program) => (
          <li key={program.id}>
            <Link
              href={`/admin/programs/${program.id}`}
              className="card flex items-center justify-between p-4 hover:border-rahoot-red"
            >
              <span className="font-semibold">{program.name}</span>
              <span className="text-sm text-rahoot-muted">
                {program.groupCount} group{program.groupCount === 1 ? "" : "s"} per subject &middot;{" "}
                {program._count.subjects} subject{program._count.subjects === 1 ? "" : "s"} &middot;{" "}
                {program._count.users} member{program._count.users === 1 ? "" : "s"}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="card p-6">
        <h2 className="font-bold">Create a program</h2>
        <form action={createProgram} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex-1 text-sm font-semibold sm:min-w-[16rem] sm:flex-none">
            Program name
            <input name="name" required maxLength={80} placeholder="e.g. Cybersecurity" className="input mt-1" />
          </label>
          <label className="text-sm font-semibold">
            Groups per subject
            <input
              type="number"
              name="groupCount"
              required
              min={1}
              max={10}
              defaultValue={3}
              className="input mt-1 !w-24"
            />
          </label>
          <button type="submit" className="btn btn-primary">
            Create program
          </button>
        </form>
        <p className="mt-2 text-xs text-rahoot-muted">
          Every subject added to this program will get this many fixed groups (I, II, III, ...). This can&apos;t be
          changed later - there is no group add/remove workflow, per the existing design.
        </p>
        {error && <p className="mt-3 text-sm font-medium text-rahoot-red">{error}</p>}
      </section>
    </div>
  );
}
