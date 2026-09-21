import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/session";
import { listPrograms } from "@/lib/programs";
import { setStudentPassword, changeStudentProgram } from "../actions";
import { SetPasswordForm } from "../SetPasswordForm";
import { ChangeProgramForm } from "../ChangeProgramForm";

const STATUS_STYLES: Record<string, string> = {
  IN_PROGRESS: "badge-neutral",
  COMPLETED: "badge-success",
  FAILED: "badge-danger",
};

const PASSWORD_ERROR_MESSAGES: Record<string, string> = {
  weak: "Password must be at least 8 characters.",
  mismatch: "Passwords do not match.",
};

export default async function StudentPerformancePage({
  params,
  searchParams,
}: PageProps<"/admin/students/[id]">) {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const { id } = await params;
  const search = await searchParams;
  const justUpdated = search?.updated === "1";
  const programChanged = search?.programChanged === "1";
  const revealedPassword = typeof search?.password === "string" ? search.password : null;
  const pwError = typeof search?.pwerror === "string" ? PASSWORD_ERROR_MESSAGES[search.pwerror] ?? null : null;

  const student = await prisma.user.findFirst({
    where: { id, role: "STUDENT" },
    include: {
      program: true,
      quizAttempts: {
        where: { status: { in: ["COMPLETED", "FAILED"] } },
        include: { homework: { select: { id: true, title: true } } },
        orderBy: { completedAt: "desc" },
      },
      subjectGroups: { include: { subject: true, group: true }, orderBy: { subject: { order: "asc" } } },
    },
  });
  if (!student) notFound();
  // Ownership check: hiding this student from a regular Admin's list is not
  // what makes this safe - a regular Admin hitting this exact URL for a
  // student in another program must be rejected here too.
  if (admin.role !== "SUPER_ADMIN" && student.programId !== admin.programId) notFound();

  // This admin-facing detail page intentionally shows the student's FULL
  // history across every program they've ever been in (a complete audit
  // trail), unlike the leaderboard/profile/dashboard totals, which are
  // scoped to the student's CURRENT program only - see
  // getCumulativeLeaderboard's doc comment for that policy.
  const totalScore = student.quizAttempts.reduce((sum, a) => sum + a.score, 0);
  const completedCount = student.quizAttempts.filter((a) => a.status === "COMPLETED").length;
  const setPassword = setStudentPassword.bind(null, student.id);
  const changeProgram = changeStudentProgram.bind(null, student.id);
  const programs = admin.role === "SUPER_ADMIN" ? await listPrograms() : [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <Link href="/admin/students" className="text-sm text-rahoot-red hover:underline">
          &larr; Back to students
        </Link>
        <Link href={`/admin/students/${student.id}/edit`} className="btn btn-outline !py-1.5 !px-3 text-sm">
          Edit
        </Link>
      </div>
      {justUpdated && <p className="mt-3 text-sm font-medium text-green-400">Changes saved.</p>}
      {programChanged && (
        <p className="mt-3 text-sm font-medium text-green-400">
          Program changed. Previous subject/group assignments were cleared.
        </p>
      )}
      <h1 className="mt-2 text-2xl font-bold">
        {student.firstName} {student.lastName}
      </h1>
      <p className="mt-1 text-sm text-rahoot-muted">
        @{student.username} &middot; {student.program?.name ?? "No program"}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:w-fit">
        <div className="card p-4">
          <span className="text-xs uppercase tracking-wide text-rahoot-muted">Cumulative score</span>
          <div className="text-3xl font-black">{totalScore}</div>
        </div>
        <div className="card p-4">
          <span className="text-xs uppercase tracking-wide text-rahoot-muted">Quizzes completed</span>
          <div className="text-3xl font-black">{completedCount}</div>
        </div>
      </div>

      {revealedPassword && (
        <div className="card mt-6 border-2 border-rahoot-red p-4">
          <p className="font-semibold">New password for @{student.username}</p>
          <p className="mt-1 text-sm text-rahoot-muted">
            Password: <span className="font-mono text-rahoot-ink select-all">{revealedPassword}</span>
          </p>
          <p className="mt-2 text-xs text-rahoot-muted">
            This is shown once and can&apos;t be retrieved again - copy it now. The student has been signed out
            everywhere and must log in again with it.
          </p>
        </div>
      )}

      {admin.role === "SUPER_ADMIN" && (
        <section className="card mt-6 p-6">
          <h2 className="font-bold">Program</h2>
          <p className="mt-1 text-sm text-rahoot-muted">
            Moving a student to a different program clears their current subject/group assignments (their quiz
            history and scores are never affected).
          </p>
          <div className="mt-4">
            <ChangeProgramForm action={changeProgram} programs={programs} currentProgramId={student.programId} />
          </div>
        </section>
      )}

      <section className="card mt-6 p-6">
        <h2 className="font-bold">Set a new password</h2>
        <p className="mt-1 text-sm text-rahoot-muted">
          The student&apos;s current password can&apos;t be viewed - only replaced.
        </p>
        {pwError && <p className="mt-2 text-sm font-medium text-rahoot-red">{pwError}</p>}
        <div className="mt-4">
          <SetPasswordForm action={setPassword} studentName={`${student.firstName} ${student.lastName}`} />
        </div>
      </section>

      <h2 className="mt-8 font-bold">Subject / group assignments</h2>
      {student.subjectGroups.length === 0 ? (
        <p className="mt-3 text-sm text-rahoot-muted">No subjects assigned yet.</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {student.subjectGroups.map((sg) => (
            <li key={sg.id} className="badge bg-rahoot-red-light text-rahoot-red">
              {sg.subject.name}: {sg.group?.name ?? "No group yet"}
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-8 font-bold">
        Quiz history <span className="font-normal text-rahoot-muted">({student.quizAttempts.length})</span>
      </h2>

      {student.quizAttempts.length === 0 ? (
        <p className="mt-4 text-sm text-rahoot-muted">No completed or failed attempts yet.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {student.quizAttempts.map((attempt) => (
            <li key={attempt.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <Link
                  href={`/admin/quizzes/${attempt.homework.id}/results`}
                  className="font-semibold hover:text-rahoot-red hover:underline"
                >
                  {attempt.homework.title}
                </Link>
                <p className="text-sm text-rahoot-muted">
                  {attempt.tabSwitchCount} tab switch{attempt.tabSwitchCount === 1 ? "" : "es"}
                  {attempt.failureReason ? ` · ${attempt.failureReason}` : ""} &middot;{" "}
                  {(attempt.completedAt ?? attempt.startedAt).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold">
                  {attempt.score} / {attempt.totalQuestions}
                </span>
                <span className={`badge ${STATUS_STYLES[attempt.status]}`}>{attempt.status}</span>
                {attempt.status !== "FAILED" && (
                  <Link
                    href={`/admin/students/${student.id}/attempts/${attempt.id}`}
                    className="btn btn-outline !py-1.5 !px-3 text-sm"
                  >
                    View answers
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
