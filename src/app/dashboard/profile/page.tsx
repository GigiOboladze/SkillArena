import { redirect } from "next/navigation";
import { getCurrentStudent } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { updateStudentUsername, updateStudentPassword } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  username: "Please enter a username (up to 40 characters).",
  taken: "This username is already in use.",
  weak: "Password must be at least 8 characters.",
  mismatch: "Passwords do not match.",
};

export default async function StudentProfilePage({
  searchParams,
}: PageProps<"/dashboard/profile">) {
  const student = await getCurrentStudent();
  if (!student) redirect("/login");

  const search = await searchParams;
  const errorKey = typeof search?.error === "string" ? search.error : null;
  const error = errorKey ? ERROR_MESSAGES[errorKey] ?? null : null;
  const updated = search?.updated;

  const [program, attempts, subjectGroups] = await Promise.all([
    student.programId ? prisma.program.findUnique({ where: { id: student.programId } }) : null,
    // Scoped to the student's current program, same policy as the
    // leaderboard (see getCumulativeLeaderboard's doc comment) - so the
    // total shown here always matches what the leaderboard shows for them.
    prisma.quizAttempt.findMany({
      where: {
        studentId: student.id,
        status: { in: ["COMPLETED", "FAILED"] },
        homework: { subject: { programId: student.programId ?? undefined } },
      },
      select: { score: true },
    }),
    prisma.studentSubjectGroup.findMany({
      where: { studentId: student.id },
      include: { subject: true, group: true },
      orderBy: { subject: { order: "asc" } },
    }),
  ]);
  const totalScore = attempts.reduce((sum, a) => sum + a.score, 0);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8">
      <h1 className="text-2xl font-bold">My Profile</h1>

      <section className="card p-6">
        <h2 className="font-bold">Personal information</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-rahoot-muted">First name</p>
            <p className="font-semibold">{student.firstName}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-rahoot-muted">Last name</p>
            <p className="font-semibold">{student.lastName}</p>
          </div>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="font-bold">Academic summary</h2>
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide text-rahoot-muted">Program</p>
          <p className="font-semibold">{program?.name ?? "Not assigned"}</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-rahoot-muted">Total points</p>
            <p className="text-2xl font-black">{totalScore}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-rahoot-muted">Quizzes completed</p>
            <p className="text-2xl font-black">{attempts.length}</p>
          </div>
        </div>
        {subjectGroups.length > 0 && (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide text-rahoot-muted">Subjects &amp; groups</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {subjectGroups.map((sg) => (
                <li key={sg.id} className="badge bg-rahoot-red-light text-rahoot-red">
                  {sg.subject.name}: {sg.group?.name ?? "no group yet"}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="card p-6">
        <h2 className="font-bold">Change username</h2>
        <form action={updateStudentUsername} className="mt-4 flex flex-col gap-3">
          <label className="text-sm font-semibold">
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
          {updated === "username" && <p className="text-sm font-medium text-green-400">Username updated.</p>}
          {error && (errorKey === "username" || errorKey === "taken") && (
            <p className="text-sm font-medium text-rahoot-red">{error}</p>
          )}
          <button type="submit" className="btn btn-outline self-start">
            Save changes
          </button>
        </form>
      </section>

      <section className="card p-6">
        <h2 className="font-bold">Change password</h2>
        <p className="mt-1 text-sm text-rahoot-muted">
          You&apos;ll be signed out everywhere and asked to log in again with the new password.
        </p>
        <form action={updateStudentPassword} className="mt-4 flex flex-col gap-3">
          <label className="text-sm font-semibold">
            New password
            <input type="password" name="password" required minLength={8} className="input mt-1" />
          </label>
          <label className="text-sm font-semibold">
            Confirm new password
            <input type="password" name="confirmPassword" required minLength={8} className="input mt-1" />
          </label>
          {error && (errorKey === "weak" || errorKey === "mismatch") && (
            <p className="text-sm font-medium text-rahoot-red">{error}</p>
          )}
          <button type="submit" className="btn btn-primary self-start">
            Change password
          </button>
        </form>
      </section>
    </div>
  );
}
