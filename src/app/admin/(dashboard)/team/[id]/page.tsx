import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStaffWith } from "@/lib/staff-guard";
import { readPasswordFlash } from "@/lib/password-flash";
import { ROLE_LABELS } from "@/lib/authz";
import { CopyTextButton } from "@/components/admin/CopyTextButton";
import { resetStaffPassword, setStaffActive, updateStaff } from "../actions";
import { loadStaffFormOptions } from "../options";
import { StaffForm, type StaffFormRole } from "../StaffForm";

const ERRORS: Record<string, string> = {
  name: "Enter a first name.",
  role: "Pick a role.",
  program: "Pick a program.",
};

export default async function ManageStaffPage({ params, searchParams }: PageProps<"/admin/team/[id]">) {
  const superAdmin = await getStaffWith("staff.manage");
  if (!superAdmin) notFound();
  const { id } = await params;
  const search = await searchParams;

  // The Super Admin's own account and students are never managed here.
  const user = await prisma.user.findFirst({
    where: { id, role: { notIn: ["STUDENT", "SUPER_ADMIN"] } },
    include: {
      program: { select: { name: true } },
      lecturerAssignments: { select: { groupId: true } },
      captainStudents: { select: { studentId: true } },
      captainCohorts: { select: { cohortId: true } },
      supervisedCaptains: { select: { captainId: true } },
      _count: { select: { authoredNotes: true, ownedHomeworks: true, hootGamesHosted: true } },
    },
  });
  if (!user) notFound();

  const options = await loadStaffFormOptions(user.role === "ADMIN");
  const password = readPasswordFlash(typeof search?.pw === "string" ? search.pw : null);
  const error = typeof search?.error === "string" ? ERRORS[search.error] : null;
  const notice =
    search?.created === "1"
      ? "Staff account created."
      : search?.saved === "1"
        ? "Changes saved."
        : search?.deactivated === "1"
          ? "Account deactivated. Every session it had was signed out."
          : search?.activated === "1"
            ? "Account reactivated."
            : null;

  const name = `${user.firstName} ${user.lastName}`.trim() || user.username;
  const update = updateStaff.bind(null, user.id);
  const toggleActive = setStaffActive.bind(null, user.id, !user.isActive);
  const resetPassword = resetStaffPassword.bind(null, user.id);

  return (
    <div className="sa-st">
      <nav className="sa-st-crumbs" aria-label="Breadcrumb">
        <Link href="/admin/team">Staff &amp; Access</Link>
        <span aria-hidden>/</span>
        <span>{name}</span>
      </nav>

      <header className="sa-st-head">
        <div>
          <h1>{name}</h1>
          <p>
            @{user.username} · {ROLE_LABELS[user.role]} · {user.program?.name ?? "No program"} ·{" "}
            <span className={`sa-st-status ${user.isActive ? "is-on" : "is-off"}`}>{user.isActive ? "Active" : "Deactivated"}</span>
          </p>
        </div>
      </header>

      {notice && (
        <p className="sa-st-alert is-ok" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="sa-st-alert is-error" role="alert">
          {error}
        </p>
      )}
      {password && (
        <div className="sa-st-alert is-key" role="status">
          <div>
            <strong>Password for @{user.username}</strong>
            <p>Shown once. Hand it over in person - it can&apos;t be looked up again later.</p>
          </div>
          <code>{password}</code>
          <CopyTextButton value={password} label="Copy password" />
        </div>
      )}
      {user.role === "ADMIN" && (
        <p className="sa-st-alert is-info">
          This is a legacy Admin account with program-wide access. It keeps exactly that access until you choose one of the new roles
          below and save.
        </p>
      )}

      <div className="sa-st-layout">
        <StaffForm
          mode="edit"
          action={update}
          options={options}
          selfId={user.id}
          initial={{
            firstName: user.firstName === "Admin" && !user.lastName ? "" : user.firstName,
            lastName: user.lastName,
            username: user.username,
            role: user.role as StaffFormRole,
            programId: user.programId ?? "",
            groupIds: user.lecturerAssignments.map((a) => a.groupId),
            studentIds: user.captainStudents.map((a) => a.studentId),
            cohortIds: user.captainCohorts.map((a) => a.cohortId),
            captainIds: user.supervisedCaptains.map((a) => a.captainId),
          }}
        />

        <aside className="sa-st-side">
          <section className="sa-st-card">
            <h2>Access</h2>
            <p>
              {user.isActive
                ? "Deactivating blocks sign-in and ends every open session immediately. Nothing is deleted."
                : "This account can't sign in. Reactivate it to restore its access."}
            </p>
            <form action={toggleActive}>
              <button type="submit" className={user.isActive ? "sa-st-danger" : "sa-st-primary"}>
                {user.isActive ? "Deactivate account" : "Reactivate account"}
              </button>
            </form>
          </section>
          <section className="sa-st-card">
            <h2>Password</h2>
            <p>Generates a new temporary password and signs the account out everywhere.</p>
            <form action={resetPassword}>
              <button type="submit" className="sa-st-ghost">
                Reset password
              </button>
            </form>
          </section>
          <section className="sa-st-card">
            <h2>Activity</h2>
            <dl className="sa-st-dl">
              <div>
                <dt>Student notes written</dt>
                <dd>{user._count.authoredNotes}</dd>
              </div>
              <div>
                <dt>Quizzes created</dt>
                <dd>{user._count.ownedHomeworks}</dd>
              </div>
              <div>
                <dt>HootArena games</dt>
                <dd>{user._count.hootGamesHosted}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
