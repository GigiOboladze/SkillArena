import { Select } from "@/components/ui/Select";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStaffWith } from "@/lib/staff-guard";
import { quizScopeWhere, scopeSubjectsForQuizzes } from "@/lib/scope";
import { listSubjectsWithGroups } from "@/lib/subjects";
import { resolveAdminProgramScope, listPrograms } from "@/lib/programs";
import { ProgramSelector } from "@/components/ProgramSelector";
import { IconCheck, IconClock, IconPlus, IconQuiz } from "@/components/student/Icons";
import type { Prisma, HomeworkStatus } from "@/generated/prisma/client";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "badge-neutral" },
  OPEN: { label: "Published", className: "badge-success" },
  CLOSED: { label: "Unpublished", className: "badge-neutral" },
};

export default async function AdminQuizzesPage({
  searchParams,
}: PageProps<"/admin/quizzes">) {
  const admin = await getStaffWith("quizzes.manage");
  if (!admin) notFound();

  const search = await searchParams;
  const q = typeof search?.q === "string" ? search.q.trim() : "";
  const subjectId = typeof search?.subject === "string" ? search.subject : "";
  const status = typeof search?.status === "string" ? search.status : "";
  const requestedProgram = typeof search?.program === "string" ? search.program : undefined;

  const programId = await resolveAdminProgramScope(admin, requestedProgram);
  if (!programId) {
    return <p className="text-rahoot-muted">No programs exist yet - ask the Super Admin to create one.</p>;
  }

  // Program filter AND the role's own quiz scope (Lecturer: their subjects
  // and groups; Captains: quizzes they created).
  const scopeWhere = await quizScopeWhere(admin);
  const baseWhere: Prisma.HomeworkWhereInput = { AND: [scopeWhere, { mode: "QUIZ", subject: { programId } }] };
  const where: Prisma.HomeworkWhereInput = { ...baseWhere };
  if (q) where.title = { contains: q, mode: "insensitive" };
  if (subjectId) where.subjectId = subjectId;
  if (status) where.status = status as HomeworkStatus;

  const [quizzes, subjects, programs, statusCounts] = await Promise.all([
    prisma.homework.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        subject: true,
        targetGroups: { include: { group: true } },
        _count: { select: { questions: true, quizAttempts: true } },
      },
    }),
    listSubjectsWithGroups(programId).then((all) => scopeSubjectsForQuizzes(admin, all)),
    admin.role === "SUPER_ADMIN" ? listPrograms() : Promise.resolve([]),
    // Program-wide totals for the summary cards (independent of the filters below).
    prisma.homework.groupBy({ by: ["status"], where: baseWhere, _count: { _all: true } }),
  ]);
  const countOf = (s: HomeworkStatus) => statusCounts.find((c) => c.status === s)?._count._all ?? 0;
  const totalCount = statusCounts.reduce((sum, c) => sum + c._count._all, 0);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">Quizzes</h1>

      {/* ---------------- Summary panel ---------------- */}
      <section className="sa-qz-hero">
        <div className="flex flex-wrap items-center justify-end gap-3">
          {admin.role === "SUPER_ADMIN" && (
            <ProgramSelector programs={programs} currentProgramId={programId} basePath="/admin/quizzes" />
          )}
          <Link href={`/admin/quizzes/new?program=${programId}`} className="sa-qz-new">
            <IconPlus className="h-5 w-5" />
            New quiz
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sa-qz-stat">
            <span className="sa-qz-stat-icon is-violet">
              <IconQuiz className="h-8 w-8" />
            </span>
            <div className="min-w-0">
              <p className="sa-qz-stat-label">Total Quizzes</p>
              <p className="sa-qz-stat-value">{totalCount.toLocaleString()}</p>
            </div>
          </div>
          <div className="sa-qz-stat">
            <span className="sa-qz-stat-icon is-green">
              <IconCheck className="h-9 w-9" />
            </span>
            <div className="min-w-0">
              <p className="sa-qz-stat-label">Published</p>
              <p className="sa-qz-stat-value">{countOf("OPEN").toLocaleString()}</p>
            </div>
          </div>
          <div className="sa-qz-stat">
            <span className="sa-qz-stat-icon is-blue">
              <IconClock className="h-8 w-8" />
            </span>
            <div className="min-w-0">
              <p className="sa-qz-stat-label">Draft</p>
              <p className="sa-qz-stat-value">{countOf("DRAFT").toLocaleString()}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Filters ---------------- */}
      <form className="flex flex-wrap gap-3" method="get">
        {admin.role === "SUPER_ADMIN" && <input type="hidden" name="program" value={programId} />}
        <label className="sa-qz-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden className="h-5 w-5 flex-none text-rahoot-muted">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
          <span className="sr-only">Search by title</span>
          <input type="search" name="q" defaultValue={q} placeholder="Search by title&hellip;" />
        </label>
        <Select name="subject" defaultValue={subjectId} className="sa-qz-select sm:w-48">
          <option value="">All subjects</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={status} className="sa-qz-select sm:w-44">
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="OPEN">Published</option>
          <option value="CLOSED">Unpublished</option>
        </Select>
        <button type="submit" className="sa-qz-filter">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinejoin="round" aria-hidden className="h-5 w-5">
            <path d="M4 5h16l-6.2 7.4v5.1l-3.6 1.8v-6.9L4 5Z" />
          </svg>
          Filter
        </button>
      </form>

      {/* ---------------- List ---------------- */}
      {quizzes.length === 0 ? (
        <p className="text-rahoot-muted">
          {q || subjectId || status
            ? "No quizzes match those filters."
            : "No quizzes yet. Create your first one - students will see it once you publish it."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {quizzes.map((quiz) => {
            const statusInfo = STATUS_LABELS[quiz.status];
            const groupNames = quiz.targetGroups.map((t) => t.group.name.replace(/^Group /, "")).join(", ");
            return (
              <li key={quiz.id}>
                <Link href={`/admin/quizzes/${quiz.id}`} className="sa-qz-row">
                  <span className="sa-qz-row-icon">
                    <IconQuiz className="h-6 w-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="sa-qz-title">{quiz.title}</span>
                      <span className={`badge ${statusInfo.className}`}>{statusInfo.label}</span>
                    </div>
                    <p className="mt-1 text-sm text-rahoot-muted">
                      Subject: {quiz.subject?.name ?? "Not set"}
                      {groupNames && <> &middot; Groups: {groupNames}</>} &middot; {quiz._count.questions} question
                      {quiz._count.questions === 1 ? "" : "s"} &middot; {quiz._count.quizAttempts} attempt
                      {quiz._count.quizAttempts === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="sa-qz-more" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                      <circle cx="5.5" cy="12" r="1.7" />
                      <circle cx="12" cy="12" r="1.7" />
                      <circle cx="18.5" cy="12" r="1.7" />
                    </svg>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
