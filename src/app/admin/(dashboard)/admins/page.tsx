import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentSuperAdmin } from "@/lib/session";
import { createAdminAccount, deleteAdminAccount, changeAdminProgram } from "./actions";
import { MAX_ADMINS } from "@/lib/admin-constants";
import { DeleteAdminButton } from "./DeleteAdminButton";
import { listPrograms } from "@/lib/programs";
import { AdminProgramForm } from "./AdminProgramForm";

const ERROR_MESSAGES: Record<string, string> = {
  username: "Please enter a username (up to 40 characters).",
  weak: "Password must be at least 8 characters.",
  mismatch: "Passwords do not match.",
  taken: "This username is already in use.",
  full: `All ${MAX_ADMINS} admin slots are taken. Remove one before adding another.`,
  program: "Please choose a valid program.",
};

export default async function AdminManagementPage({
  searchParams,
}: PageProps<"/admin/admins">) {
  // Not just hidden from nav - a regular admin hitting this URL directly gets a 404.
  const superAdmin = await getCurrentSuperAdmin();
  if (!superAdmin) notFound();

  const search = await searchParams;
  const error = typeof search?.error === "string" ? ERROR_MESSAGES[search.error] ?? null : null;
  const justCreated = search?.created === "1";
  const programChanged = search?.programChanged === "1";

  const [admins, programs] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } },
      include: { program: true },
      orderBy: [{ role: "asc" }, { username: "asc" }],
    }),
    listPrograms(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Admin Management</h1>
        <p className="mt-1 text-sm text-rahoot-muted">
          Admins{" "}
          <span className="font-semibold text-rahoot-ink">
            {admins.length} / {MAX_ADMINS}
          </span>
        </p>
      </div>

      {justCreated && <p className="text-sm font-medium text-green-400">Admin account created.</p>}
      {programChanged && <p className="text-sm font-medium text-green-400">Admin's program updated.</p>}

      <section>
        <ul className="flex flex-col gap-2">
          {admins.map((admin) => {
            const remove = deleteAdminAccount.bind(null, admin.id);
            const changeProgram = changeAdminProgram.bind(null, admin.id);
            const isSuperAdmin = admin.role === "SUPER_ADMIN";
            return (
              <li key={admin.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold">{admin.username}</p>
                  <p className="text-sm text-rahoot-muted">
                    {isSuperAdmin ? "Super Admin - all programs" : admin.program?.name ?? "No program"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {!isSuperAdmin && (
                    <AdminProgramForm action={changeProgram} programs={programs} currentProgramId={admin.programId} />
                  )}
                  {isSuperAdmin ? (
                    <span className="badge badge-neutral">Protected</span>
                  ) : (
                    <form action={remove}>
                      <DeleteAdminButton username={admin.username} />
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card p-6">
        <h2 className="font-bold">Create admin</h2>
        {admins.length >= MAX_ADMINS ? (
          <p className="mt-3 text-sm text-rahoot-muted">
            All {MAX_ADMINS} admin slots are in use. Remove an admin to free up a slot.
          </p>
        ) : (
          <form action={createAdminAccount} className="mt-4 flex flex-col gap-3">
            <label className="text-sm font-semibold">
              Username
              <input name="username" required maxLength={40} autoCapitalize="off" className="input mt-1" />
            </label>
            <label className="text-sm font-semibold">
              Password
              <input type="password" name="password" required minLength={8} className="input mt-1" />
            </label>
            <label className="text-sm font-semibold">
              Confirm password
              <input type="password" name="confirmPassword" required minLength={8} className="input mt-1" />
            </label>
            <label className="text-sm font-semibold">
              Program
              <select name="programId" required defaultValue="" className="input mt-1">
                <option value="" disabled>
                  Choose a program&hellip;
                </option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            {error && <p className="text-sm font-medium text-rahoot-red">{error}</p>}
            <button type="submit" className="btn btn-primary self-start">
              Create admin
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
