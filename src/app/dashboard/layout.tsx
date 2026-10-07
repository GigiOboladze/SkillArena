import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStudent } from "@/lib/session";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { logout } from "./actions";

// Second line of defense behind proxy.ts: every server render under the
// student dashboard/quiz area re-checks the session before touching any data.
export default async function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  const student = await getCurrentStudent();
  if (!student) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b-4 border-rahoot-red bg-rahoot-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Logo size={32} variant="mark" priority />
            <span className="text-lg font-black text-rahoot-ink">SkillArena</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm font-semibold">
            <Link href="/dashboard" className="hover:text-rahoot-red">
              Dashboard
            </Link>
            <Link href="/dashboard/leaderboard" className="hover:text-rahoot-red">
              Leaderboard
            </Link>
            <Link href="/dashboard/bug-reports" className="hover:text-rahoot-red">
              Bug Reports
            </Link>
            <Link href="/dashboard/inco" className="hover:text-rahoot-red">
              INCO
            </Link>
            <Link href="/dashboard/profile" className="hover:text-rahoot-red">
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
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
