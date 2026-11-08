import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getProgram } from "@/lib/programs";
import { AppSidebar, type SidebarItem } from "@/components/student/AppSidebar";
import { logout } from "./actions";

/** Admins created via Admin Management are stored as first name "Admin" with no last name - show their username then. */
function adminDisplayName(admin: { firstName: string; lastName: string; username: string }) {
  const full = `${admin.firstName} ${admin.lastName}`.trim();
  return full && full !== "Admin" ? full : admin.username;
}

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

  const isSuper = admin.role === "SUPER_ADMIN";
  // Independent reads, run together. The INCO count is only queried (and
  // only ever shown) for the Super Admin - a regular Admin gets neither the
  // nav link nor a hint via an unread count that INCO submissions even exist.
  const [program, openBugReportCount, newIncoCount] = await Promise.all([
    admin.programId ? getProgram(admin.programId) : Promise.resolve(null),
    prisma.bugReport.count({ where: { status: "OPEN" } }),
    isSuper ? prisma.incoSubmission.count({ where: { status: "NEW" } }) : Promise.resolve(0),
  ]);

  // Same links, same role gating as the previous header nav - only the
  // presentation moved into the sidebar.
  const items: SidebarItem[] = [
    { href: "/admin", label: "Overview", icon: "home", exact: true },
    { href: "/admin/quizzes", label: "Quizzes", icon: "quiz" },
    { href: "/admin/hootarena", label: "HootArena", icon: "gamepad" },
    { href: "/admin/students", label: "Students", icon: "users" },
    { href: "/admin/leaderboard", label: "Leaderboard", icon: "trophy" },
    { href: "/admin/bug-reports", label: "Bug Reports", icon: "bug", count: openBugReportCount },
    ...(isSuper
      ? ([
          { href: "/admin/inco", label: "INCO", icon: "message", count: newIncoCount },
          { href: "/admin/admins", label: "Admin Management", icon: "shield" },
          { href: "/admin/programs", label: "Programs", icon: "layers" },
        ] satisfies SidebarItem[])
      : []),
    { href: "/admin/profile", label: "My Profile", icon: "user" },
  ];

  return (
    <div className="sa-shell">
      <AppSidebar
        homeHref="/admin"
        areaLabel="Admin"
        items={items}
        userName={adminDisplayName(admin)}
        userDetail={isSuper ? "Super Admin" : (program?.name ?? "Admin")}
        logoutAction={logout}
      />
      <main className="sa-main">{children}</main>
    </div>
  );
}
