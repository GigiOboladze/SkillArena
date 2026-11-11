import { Select } from "@/components/ui/Select";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaffWith } from "@/lib/staff-guard";
import { scopeSubjectsForQuizzes } from "@/lib/scope";
import { createQuiz } from "../actions";
import { listSubjectsWithGroups } from "@/lib/subjects";
import { resolveAdminProgramScope, listPrograms } from "@/lib/programs";
import { ProgramSelector } from "@/components/ProgramSelector";
import { IconQuiz } from "@/components/student/Icons";

const ERROR_MESSAGES: Record<string, string> = {
  title: "Please enter a title.",
  subject: "Please choose a subject.",
};

export default async function NewQuizPage({
  searchParams,
}: PageProps<"/admin/quizzes/new">) {
  const admin = await getStaffWith("quizzes.manage");
  if (!admin) notFound();

  const search = await searchParams;
  const error = typeof search?.error === "string" ? ERROR_MESSAGES[search.error] ?? null : null;
  const requestedProgram = typeof search?.program === "string" ? search.program : undefined;

  const programId = await resolveAdminProgramScope(admin, requestedProgram);
  if (!programId) {
    return <p className="text-rahoot-muted">No programs exist yet - ask the Super Admin to create one.</p>;
  }

  const [subjects, programs] = await Promise.all([
    listSubjectsWithGroups(programId).then((all) => scopeSubjectsForQuizzes(admin, all)),
    admin.role === "SUPER_ADMIN" ? listPrograms() : Promise.resolve([]),
  ]);
  const createQuizInProgram = createQuiz.bind(null, programId);

  return (
    <section className="sa-qn">
      {admin.role === "SUPER_ADMIN" && programs.length > 1 && (
        <div className="sa-qn-program">
          <span className="sa-qn-program-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4M13.5 5.5l-3 13" />
            </svg>
          </span>
          <ProgramSelector programs={programs} currentProgramId={programId} basePath="/admin/quizzes/new" />
        </div>
      )}

      <Link href="/admin/quizzes" className="sa-qn-back">
        &larr; Back to quizzes
      </Link>
      <h1 className="sa-qn-title">New quiz</h1>

      <form action={createQuizInProgram} className="sa-qn-card">
        <div className="sa-qn-grid">
          <div className="sa-qn-art" aria-hidden>
            <span className="sa-qn-art-tile">
              <IconQuiz className="h-14 w-14" />
            </span>
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            <label className="sa-qn-label">
              Quiz title
              <input
                name="title"
                required
                maxLength={120}
                placeholder="JavaScript Fundamentals - Lecture 4"
                className="sa-qn-input"
                autoFocus
              />
            </label>
            <label className="sa-qn-label">
              Subject
              <Select name="subjectId" required defaultValue="" className="sa-qn-input">
                <option value="" disabled>
                  Choose a subject&hellip;
                </option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        </div>
        {error && <p className="mt-4 text-sm font-medium text-rahoot-red">{error}</p>}
        <button type="submit" className="sa-qn-submit">
          Create quiz
        </button>
      </form>
    </section>
  );
}
