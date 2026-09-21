import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { logout } from "./actions";

// Second line of defense behind proxy.ts (see the Next.js auth guide's
// recommendation to not rely on Proxy alone): every server render under the
// dashboard re-checks the session before touching any admin data.
export default async function AdminDashboardLayout({
  children,
}: LayoutProps<"/admin">) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect("/admin/login");
  }

  const program = admin.programId ? await prisma.program.findUnique({ where: { id: admin.programId } }) : null;
  const openBugReportCount = await prisma.bugReport.count({ where: { status: "OPEN" } });
  // Only queried (and only ever shown) for the Super Admin - a regular
  // Admin gets neither the nav link nor a hint via an unread count that
  // INCO submissions even exist.
  const newIncoCount =
    admin.role === "SUPER_ADMIN" ? await prisma.incoSubmission.count({ where: { status: "NEW" } }) : 0;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b-4 border-rahoot-red bg-rahoot-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link href="/admin" className="flex items-center gap-2">
            <Logo size={32} variant="mark" priority />
            <span className="text-lg font-black text-rahoot-ink">SkillArena admin</span>
            {program && (
              <span className="badge bg-rahoot-red-light text-rahoot-red">{program.name}</span>
            )}
          </Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm font-semibold">
            <Link href="/admin/quizzes" className="hover:text-rahoot-red">
              Quizzes
            </Link>
            <Link href="/admin/students" className="hover:text-rahoot-red">
              Students
            </Link>
            <Link href="/admin/leaderboard" className="hover:text-rahoot-red">
              Leaderboard
            </Link>
            <Link href="/admin/bug-reports" className="flex items-center gap-1.5 hover:text-rahoot-red">
              Bug Reports
              {openBugReportCount > 0 && (
                <span className="badge badge-danger !px-1.5">{openBugReportCount}</span>
              )}
            </Link>
            {admin.role === "SUPER_ADMIN" && (
              <Link href="/admin/inco" className="flex items-center gap-1.5 hover:text-rahoot-red">
                INCO
                {newIncoCount > 0 && <span className="badge badge-danger !px-1.5">{newIncoCount}</span>}
              </Link>
            )}
            {admin.role === "SUPER_ADMIN" && (
              <Link href="/admin/admins" className="hover:text-rahoot-red">
                Admin Management
              </Link>
            )}
            {admin.role === "SUPER_ADMIN" && (
              <Link href="/admin/programs" className="hover:text-rahoot-red">
                Programs
              </Link>
            )}
            <Link href="/admin/profile" className="hover:text-rahoot-red">
              My Profile
            </Link>
            <form action={logout}>
              <button type="submit" className="btn btn-outline !py-2 !px-4 text-sm">
                Log out
              </button>
            </form>
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}
