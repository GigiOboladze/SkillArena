import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/session";
import { listSubjectsWithGroups } from "@/lib/subjects";
import { resolveAdminProgramScope, listPrograms } from "@/lib/programs";
import { ProgramSelector } from "@/components/ProgramSelector";
import type { Prisma, HomeworkStatus } from "@/generated/prisma/client";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "badge-neutral" },
  OPEN: { label: "Published", className: "badge-success" },
  CLOSED: { label: "Unpublished", className: "badge-neutral" },
};

export default async function AdminQuizzesPage({
  searchParams,
}: PageProps<"/admin/quizzes">) {
  const admin = await getCurrentAdmin();
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

  const where: Prisma.HomeworkWhereInput = { mode: "QUIZ", subject: { programId } };
  if (q) where.title = { contains: q, mode: "insensitive" };
  if (subjectId) where.subjectId = subjectId;
  if (status) where.status = status as HomeworkStatus;

  const [quizzes, subjects, programs] = await Promise.all([
    prisma.homework.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        subject: true,
        targetGroups: { include: { group: true } },
        _count: { select: { questions: true, quizAttempts: true } },
      },
    }),
    listSubjectsWithGroups(programId),
    admin.role === "SUPER_ADMIN" ? listPrograms() : Promise.resolve([]),
  ]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Quizzes</h1>
        <div className="flex items-center gap-3">
          {admin.role === "SUPER_ADMIN" && (
            <ProgramSelector programs={programs} currentProgramId={programId} basePath="/admin/quizzes" />
          )}
          <Link href={`/admin/quizzes/new?program=${programId}`} className="btn btn-primary">
            + New quiz
          </Link>
        </div>
      </div>

      <form className="card mt-6 flex flex-wrap gap-3 p-4" method="get">
        {admin.role === "SUPER_ADMIN" && <input type="hidden" name="program" value={programId} />}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by title&hellip;"
          className="input flex-1 sm:min-w-[12rem] sm:flex-none"
        />
        <select name="subject" defaultValue={subjectId} className="input sm:w-48">
          <option value="">All subjects</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status} className="input sm:w-40">
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="OPEN">Published</option>
          <option value="CLOSED">Unpublished</option>
        </select>
        <button type="submit" className="btn btn-outline">
          Filter
        </button>
      </form>

      {quizzes.length === 0 ? (
        <p className="mt-8 text-rahoot-muted">
          {q || subjectId || status
            ? "No quizzes match those filters."
            : "No quizzes yet. Create your first one - students will see it once you publish it."}
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {quizzes.map((quiz) => {
            const statusInfo = STATUS_LABELS[quiz.status];
            const groupNames = quiz.targetGroups.map((t) => t.group.name.replace(/^Group /, "")).join(", ");
            return (
              <li key={quiz.id}>
                <Link
                  href={`/admin/quizzes/${quiz.id}`}
                  className="card flex items-center justify-between p-4 hover:border-rahoot-red"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{quiz.title}</span>
                      <span className={`badge ${statusInfo.className}`}>{statusInfo.label}</span>
                    </div>
                    <p className="mt-1 text-sm text-rahoot-muted">
                      Subject: {quiz.subject?.name ?? "Not set"}
                      {groupNames && <> &middot; Groups: {groupNames}</>} &middot; {quiz._count.questions} question
                      {quiz._count.questions === 1 ? "" : "s"} &middot; {quiz._count.quizAttempts} attempt
                      {quiz._count.quizAttempts === 1 ? "" : "s"}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
