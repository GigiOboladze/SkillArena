import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/session";
import { updateAdminUsername, updateAdminPassword } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  username: "Please enter a username (up to 40 characters).",
  taken: "This username is already in use.",
  weak: "Password must be at least 8 characters.",
  mismatch: "Passwords do not match.",
};

export default async function AdminProfilePage({
  searchParams,
}: PageProps<"/admin/profile">) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");

  const search = await searchParams;
  const error = typeof search?.error === "string" ? ERROR_MESSAGES[search.error] ?? null : null;
  const updated = search?.updated;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8">
      <h1 className="text-2xl font-bold">My Profile</h1>

      <section className="card p-6">
        <p className="text-xs uppercase tracking-wide text-rahoot-muted">Role</p>
        <p className="font-semibold">{admin.role === "SUPER_ADMIN" ? "Super Admin" : "Admin"}</p>
      </section>

      <section className="card p-6">
        <h2 className="font-bold">Change username</h2>
        <form action={updateAdminUsername} className="mt-4 flex flex-col gap-3">
          <label className="text-sm font-semibold">
            Username
            <input
              name="username"
              required
              maxLength={40}
              autoCapitalize="off"
              defaultValue={admin.username}
              className="input mt-1"
            />
          </label>
          {updated === "username" && <p className="text-sm font-medium text-green-400">Username updated.</p>}
          {error && (error === "username" || error === "taken") && (
            <p className="text-sm font-medium text-rahoot-red">{error && ERROR_MESSAGES[error]}</p>
          )}
          <button type="submit" className="btn btn-outline self-start">
            Save changes
          </button>
        </form>
      </section>

      <section className="card p-6">
        <h2 className="font-bold">Change password</h2>
        <p className="mt-1 text-sm text-rahoot-muted">
          You&apos;ll be logged out and asked to sign in again with the new password.
        </p>
        <form action={updateAdminPassword} className="mt-4 flex flex-col gap-3">
          <label className="text-sm font-semibold">
            New password
            <input type="password" name="password" required minLength={8} className="input mt-1" />
          </label>
          <label className="text-sm font-semibold">
            Confirm new password
            <input type="password" name="confirmPassword" required minLength={8} className="input mt-1" />
          </label>
          {error && (error === "weak" || error === "mismatch") && (
            <p className="text-sm font-medium text-rahoot-red">{ERROR_MESSAGES[error]}</p>
          )}
          <button type="submit" className="btn btn-primary self-start">
            Change password
          </button>
        </form>
      </section>
    </div>
  );
}
