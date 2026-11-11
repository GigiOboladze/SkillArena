import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getProgram } from "@/lib/programs";
import { can, isFullAdmin, ROLE_LABELS } from "@/lib/authz";
import { incoScopeWhere } from "@/lib/scope";
import { AppSidebar, type SidebarItem } from "@/components/student/AppSidebar";
import { logout } from "./actions";

/** Admins created via the old Admin Management are stored as first name "Admin" with no last name - show their username then. */
function staffDisplayName(staff: { firstName: string; lastName: string; username: string }) {
  const full = `${staff.firstName} ${staff.lastName}`.trim();
  return full && full !== "Admin" ? full : staff.username;
}

// Second line of defense behind proxy.ts: every server render under the
// staff workspace re-checks the session (valid, current sessionVersion,
// active account, staff role) before touching any data. The sidebar only
// lists areas the role's capabilities allow - but each page and action
// re-checks for itself; hiding a link is never what makes an area safe.
export default async function AdminDashboardLayout({
  children,
}: LayoutProps<"/admin">) {
  const staff = await getCurrentStaff();
  if (!staff) {
    redirect("/login");
  }

  const fullAdmin = isFullAdmin(staff);
  const [program, openBugReportCount, newIncoCount] = await Promise.all([
    staff.programId ? getProgram(staff.programId) : Promise.resolve(null),
    can(staff, "bugs.manage") ? prisma.bugReport.count({ where: { status: "OPEN" } }) : Promise.resolve(0),
    can(staff, "inco.view")
      ? prisma.incoSubmission.count({ where: { AND: [incoScopeWhere(staff), { status: "NEW" }] } })
      : Promise.resolve(0),
  ]);

  const items: SidebarItem[] = [{ href: "/admin", label: "Overview", icon: "home", exact: true }];
  if (fullAdmin) items.push({ href: "/admin/students", label: "Students", icon: "users" });
  else if (can(staff, "students.view")) items.push({ href: "/admin/my-students", label: "My Students", icon: "users", shortLabel: "Students" });
  if (can(staff, "captains.supervise")) items.push({ href: "/admin/supervision", label: "Captains", icon: "shield" });
  if (can(staff, "quizzes.manage")) items.push({ href: "/admin/quizzes", label: "Quizzes", icon: "quiz" });
  if (can(staff, "hoot.host")) items.push({ href: "/admin/hootarena", label: "HootArena", icon: "gamepad" });
  if (can(staff, "leaderboard.view")) items.push({ href: "/admin/leaderboard", label: "Leaderboard", icon: "trophy" });
  if (can(staff, "inco.view")) items.push({ href: "/admin/inco", label: "INCO", icon: "message", count: newIncoCount });
  if (can(staff, "bugs.manage")) items.push({ href: "/admin/bug-reports", label: "Bug Reports", icon: "bug", count: openBugReportCount });
  if (can(staff, "staff.manage")) items.push({ href: "/admin/team", label: "Staff & Access", icon: "shield", shortLabel: "Staff" });
  if (can(staff, "programs.manage")) {
    items.push({ href: "/admin/programs", label: "Programs", icon: "layers" });
    items.push({ href: "/admin/cohorts", label: "Cohorts", icon: "users" });
  }
  items.push({ href: "/admin/profile", label: "My Profile", icon: "user", shortLabel: "Profile" });

  const roleLabel = ROLE_LABELS[staff.role];
  return (
    <div className="sa-shell">
      <AppSidebar
        homeHref="/admin"
        areaLabel={staff.role === "SUPER_ADMIN" ? "Admin" : "Staff"}
        items={items}
        userName={staffDisplayName(staff)}
        userDetail={program ? `${roleLabel} · ${program.name}` : roleLabel}
        logoutAction={logout}
      />
      <main className="sa-main">{children}</main>
    </div>
  );
}
