import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/session";
import type { Prisma } from "@/generated/prisma/client";

export default async function AdminOverviewPage() {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  // A regular Admin's overview is scoped to their own program; the Super
  // Admin sees totals across every program (the per-program breakdowns live
  // in Students/Quizzes/Leaderboard, which already have a program selector -
  // duplicating that selector here would be the kind of unnecessary
  // complexity this page should avoid). The CHECK constraint on User
  // guarantees a non-SUPER_ADMIN always has a programId, but this sentinel
  // keeps the query well-defined for the type checker (and matches nothing,
  // rather than everything, in the impossible case it's ever missing).
  const ownProgramId = admin.programId ?? "__no_program__";
  const quizWhere: Prisma.HomeworkWhereInput =
    admin.role === "SUPER_ADMIN" ? { mode: "QUIZ" } : { mode: "QUIZ", subject: { programId: ownProgramId } };
  const studentWhere: Prisma.UserWhereInput =
    admin.role === "SUPER_ADMIN" ? { role: "STUDENT" } : { role: "STUDENT", programId: ownProgramId };
  const attemptWhere: Prisma.QuizAttemptWhereInput =
    admin.role === "SUPER_ADMIN"
      ? { status: { in: ["COMPLETED", "FAILED"] } }
      : { status: { in: ["COMPLETED", "FAILED"] }, homework: { subject: { programId: ownProgramId } } };

  const [quizCount, publishedQuizCount, studentCount, attemptCount, liveHomeworks] = await Promise.all([
    prisma.homework.count({ where: quizWhere }),
    prisma.homework.count({ where: { ...quizWhere, status: "OPEN" } }),
    prisma.user.count({ where: studentWhere }),
    prisma.quizAttempt.count({ where: attemptWhere }),
    prisma.homework.findMany({
      where: { mode: "LIVE" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { _count: { select: { students: true } } },
    }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">Overview</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Quizzes" value={quizCount} />
        <Stat label="Published" value={publishedQuizCount} />
        <Stat label="Students" value={studentCount} />
        <Stat label="Attempts" value={attemptCount} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link href="/admin/quizzes" className="card flex flex-col p-6 hover:border-rahoot-red">
          <h2 className="text-lg font-bold">Quizzes</h2>
          <p className="mt-1 flex-1 text-sm text-rahoot-muted">Create, edit, and publish quizzes.</p>
          <span className="btn btn-primary mt-4 self-start">Manage quizzes</span>
        </Link>
        <Link href="/admin/students" className="card flex flex-col p-6 hover:border-rahoot-red">
          <h2 className="text-lg font-bold">Students</h2>
          <p className="mt-1 flex-1 text-sm text-rahoot-muted">Create accounts and review individual performance.</p>
          <span className="btn btn-primary mt-4 self-start">Manage students</span>
        </Link>
        <Link href="/admin/leaderboard" className="card flex flex-col p-6 hover:border-rahoot-red">
          <h2 className="text-lg font-bold">Leaderboard</h2>
          <p className="mt-1 flex-1 text-sm text-rahoot-muted">Cumulative standings across every quiz.</p>
          <span className="btn btn-primary mt-4 self-start">View leaderboard</span>
        </Link>
      </div>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-bold">
            Live sessions <span className="font-normal text-rahoot-muted">(legacy Kahoot-style hosting)</span>
          </h2>
          <Link href="/homeworks/new" className="btn btn-outline !py-2 !px-4 text-sm">
            + New live session
          </Link>
        </div>
        {liveHomeworks.length === 0 ? (
          <p className="mt-3 text-sm text-rahoot-muted">No live sessions yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {liveHomeworks.map((hw) => (
              <li key={hw.id}>
                <Link
                  href={`/homeworks/${hw.id}`}
                  className="card flex items-center justify-between p-3 text-sm hover:border-rahoot-red"
                >
                  <span className="font-semibold">{hw.title}</span>
                  <span className="text-rahoot-muted">
                    {hw._count.students} joined &middot; {hw.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <div className="text-2xl font-black">{value}</div>
      <div className="text-xs uppercase tracking-wide text-rahoot-muted">{label}</div>
    </div>
  );
}
