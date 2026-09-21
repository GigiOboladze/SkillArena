import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getMyCreatedHomeworkIds } from "@/lib/creator-session";
import { Logo } from "@/components/Logo";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "badge-neutral",
  OPEN: "badge-success",
  CLOSED: "badge-neutral",
};

// No login here - this just looks up whatever homeworkIds this browser's
// session cookie remembers creating (see creator-session.ts) and lists
// them. Clear cookies (or a different device) and this list is empty, even
// though the homeworks themselves still exist - that's the deliberate
// tradeoff of "no registration, no nothing".
export default async function MyHomeworksPage() {
  const ids = await getMyCreatedHomeworkIds();
  const homeworks = ids.length
    ? await prisma.homework.findMany({
        where: { id: { in: ids } },
        include: { _count: { select: { students: true, questions: true } } },
        orderBy: { createdAt: "desc" },
      })
    : [];

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <Link href="/" className="inline-block">
        <Logo size={36} priority />
      </Link>
      <div className="mt-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">My homeworks</h1>
        <Link href="/homeworks/new" className="btn btn-primary">
          + New homework
        </Link>
      </div>

      {homeworks.length === 0 ? (
        <p className="mt-8 text-rahoot-muted">
          Nothing here yet - homeworks you create on this browser show up here.{" "}
          <Link href="/homeworks/new" className="text-rahoot-red hover:underline">
            Create one
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {homeworks.map((hw) => (
            <li key={hw.id}>
              <Link
                href={`/homeworks/${hw.id}`}
                className="card flex items-center justify-between p-4 hover:border-rahoot-red"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{hw.title}</span>
                    <span className="badge bg-rahoot-red-light text-rahoot-red-dark">{hw.mode}</span>
                    <span className={`badge ${STATUS_STYLES[hw.status]}`}>{hw.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-rahoot-muted">
                    {hw._count.questions} question{hw._count.questions === 1 ? "" : "s"} &middot;{" "}
                    {hw._count.students} student{hw._count.students === 1 ? "" : "s"} joined &middot; code{" "}
                    <span className="font-mono font-semibold">{hw.joinCode}</span>
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
