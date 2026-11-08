import { redirect } from "next/navigation";
import { getCurrentStudent } from "@/lib/session";
import { getProgram } from "@/lib/programs";
import { AppSidebar, type SidebarItem } from "@/components/student/AppSidebar";
import { logout } from "./actions";

const STUDENT_NAV: SidebarItem[] = [
  { href: "/dashboard", label: "Dashboard", shortLabel: "Home", icon: "home", exact: true },
  { href: "/dashboard/leaderboard", label: "Leaderboard", shortLabel: "Ranks", icon: "trophy" },
  { href: "/dashboard/bug-reports", label: "Bug Reports", shortLabel: "Bugs", icon: "bug" },
  { href: "/dashboard/inco", label: "INCO", icon: "message" },
  { href: "/dashboard/profile", label: "My Profile", shortLabel: "Profile", icon: "user" },
];

// Second line of defense behind proxy.ts: every server render under the
// student dashboard/quiz area re-checks the session before touching any data.
export default async function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  const student = await getCurrentStudent();
  if (!student) {
    redirect("/login");
  }

  // Cached per render (see getProgram) - the dashboard page reads the same row.
  const program = student.programId ? await getProgram(student.programId) : null;

  return (
    <div className="sa-shell">
      <AppSidebar
        homeHref="/dashboard"
        items={STUDENT_NAV}
        userName={`${student.firstName} ${student.lastName}`}
        userDetail={program?.name ?? null}
        logoutAction={logout}
        bottomNav
      />
      <main className="sa-main">{children}</main>
    </div>
  );
}
