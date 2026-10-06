import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentAdmin } from "@/lib/session";
import { createHootGame } from "../actions";
import { listSubjectsWithGroups } from "@/lib/subjects";
import { resolveAdminProgramScope, listPrograms } from "@/lib/programs";
import { ProgramSelector } from "@/components/ProgramSelector";

const ERROR_MESSAGES: Record<string, string> = {
  title: "Please enter a title.",
  subject: "Please choose a subject.",
};

export default async function NewHootGamePage({
  searchParams,
}: PageProps<"/admin/hootarena/new">) {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const search = await searchParams;
  const error = typeof search?.error === "string" ? ERROR_MESSAGES[search.error] ?? null : null;
  const requestedProgram = typeof search?.program === "string" ? search.program : undefined;

  const programId = await resolveAdminProgramScope(admin, requestedProgram);
  if (!programId) {
    return <p className="text-rahoot-muted">No programs exist yet - ask the Super Admin to create one.</p>;
  }

  const [subjects, programs] = await Promise.all([
    listSubjectsWithGroups(programId),
    admin.role === "SUPER_ADMIN" ? listPrograms() : Promise.resolve([]),
  ]);
  const createGameInProgram = createHootGame.bind(null, programId);

  return (
    <div className="mx-auto max-w-lg">
      <Link href="/admin/hootarena" className="text-sm text-rahoot-red hover:underline">
        &larr; Back to HootArena
      </Link>
      <h1 className="mt-2 text-2xl font-bold">New HootArena game</h1>
      <p className="mt-1 text-sm text-rahoot-muted">
        Give it a name and a subject, then add questions and target groups. You&apos;ll get a 6-digit Game PIN
        students join with.
      </p>

      {admin.role === "SUPER_ADMIN" && (
        <div className="mt-4">
          <ProgramSelector programs={programs} currentProgramId={programId} basePath="/admin/hootarena/new" />
        </div>
      )}

      <form action={createGameInProgram} className="card mt-6 flex flex-col gap-3 p-6">
        <label className="text-sm font-semibold">
          Game title
          <input
            name="title"
            required
            maxLength={120}
            placeholder="Chapter 3 Review"
            className="input mt-1"
            autoFocus
          />
        </label>
        <label className="text-sm font-semibold">
          Subject
          <select name="subjectId" required defaultValue="" className="input mt-1">
            <option value="" disabled>
              Choose a subject&hellip;
            </option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="text-sm font-medium text-rahoot-red">{error}</p>}
        <button type="submit" className="btn btn-primary mt-2">
          Create game
        </button>
      </form>
    </div>
  );
}
