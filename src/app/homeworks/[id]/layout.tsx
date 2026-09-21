import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canManageHomework } from "@/lib/homework-auth";
import { getAdminSession } from "@/lib/session";
import { Logo } from "@/components/Logo";

// One gate for the whole /homeworks/[id]/* subtree (manage, host, grade,
// leaderboard, questions) - every page under here used to individually rely
// on the /admin dashboard layout's admin-only check. Now it's "admin, or
// whoever's browser created this specific homework" (see homework-auth.ts),
// so the check moved here instead of a blanket admin gate.
export default async function HomeworkLayout({
  children,
  params,
}: LayoutProps<"/homeworks/[id]">) {
  const { id } = await params;

  const homework = await prisma.homework.findUnique({
    where: { id },
    select: { title: true },
  });
  if (!homework) notFound();

  const authorized = await canManageHomework(id);
  const isAdmin = !!(await getAdminSession());

  if (!authorized) {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <Logo size={40} />
        <h1 className="mt-4 text-xl font-bold">Not your homework to manage</h1>
        <p className="mt-2 text-sm text-rahoot-muted">
          This browser doesn&apos;t have creator access to &quot;{homework.title}&quot;. If you made
          it on a different device, you&apos;ll need that device (or ask the admin for help).
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link href="/my-homeworks" className="btn btn-outline">
            My homeworks
          </Link>
          <Link href="/admin/login" className="text-sm text-rahoot-muted hover:text-rahoot-red">
            Admin login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b-4 border-rahoot-red bg-rahoot-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href={isAdmin ? "/admin" : "/my-homeworks"} className="flex items-center gap-2">
            <Logo size={32} priority />
          </Link>
          <Link href={isAdmin ? "/admin" : "/my-homeworks"} className="btn btn-outline !py-2 !px-4 text-sm">
            {isAdmin ? "All homeworks" : "My homeworks"}
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
