import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/authz";
import { updateAdminUsername, updateAdminPassword } from "./actions";
import { IconShield, IconUser } from "@/components/student/Icons";
import { PasswordInput } from "@/components/PasswordInput";

const ERROR_MESSAGES: Record<string, string> = {
  username: "Please enter a username (up to 40 characters).",
  taken: "This username is already in use.",
  weak: "Password must be at least 8 characters.",
  mismatch: "Passwords do not match.",
};

export default async function AdminProfilePage({
  searchParams,
}: PageProps<"/admin/profile">) {
  const admin = await getCurrentStaff();
  if (!admin) redirect("/login");

  const search = await searchParams;
  const errorKey = typeof search?.error === "string" ? search.error : null;
  const error = errorKey ? ERROR_MESSAGES[errorKey] ?? null : null;
  const updated = search?.updated;

  const roleLabel = ROLE_LABELS[admin.role];

  return (
    <div className="flex flex-col gap-10 lg:gap-14">
      {/* ---------------- Header (open, no panel) ---------------- */}
      <section className="sa-pf2-head">
        <span className="sa-pf2-glow" aria-hidden />
        <svg className="sa-pf2-wave" viewBox="0 0 600 200" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="sa-pf2-wave-stroke" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#7c5cff" stopOpacity="0" />
              <stop offset="0.75" stopColor="#8b6cff" stopOpacity="0.9" />
              <stop offset="1" stopColor="#8b6cff" stopOpacity="0.2" />
            </linearGradient>
          </defs>
          <path d="M0 190 C 220 190, 330 60, 600 40" fill="none" stroke="url(#sa-pf2-wave-stroke)" strokeWidth="3" />
          <path d="M0 196 C 240 196, 340 80, 600 70" fill="none" stroke="url(#sa-pf2-wave-stroke)" strokeWidth="1.5" opacity="0.6" />
        </svg>
        <div className="relative z-[1] min-w-0">
          <span className="sa-pg-eyebrow">My Profile</span>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            <h1 className="sa-pg-title !mt-0">My Profile</h1>
            <span className="sa-pf2-role">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                <path d="M4 8l4 4 4-6 4 6 4-4-1.5 10h-13L4 8Z" />
              </svg>
              {roleLabel}
            </span>
          </div>
          <p className="sa-pf2-lead">Manage your account details and security.</p>
          <div className="sa-pf-chips">
            <span>
              <IconUser className="h-5 w-5 text-rahoot-red" />
              {admin.username}
            </span>
            <span className="!font-medium">
              <IconShield className="h-5 w-5 text-rahoot-red" />
              {roleLabel}
            </span>
          </div>
        </div>
        <div className="sa-pg-art relative z-[1]" aria-hidden>
          <span className="sa-pf-avatar">
            <IconUser className="h-24 w-24" />
          </span>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-20">
        {/* ---------------- Username ---------------- */}
        <section>
          <h2 className="sa-pf2-title">
            <span className="sa-pf2-icon">
              <IconUser className="h-7 w-7" />
            </span>
            Change username
          </h2>
          <form action={updateAdminUsername} className="mt-5 flex flex-col gap-4">
            <label>
              <span className="sr-only">Username</span>
              <input
                name="username"
                required
                maxLength={40}
                autoCapitalize="off"
                defaultValue={admin.username}
                placeholder="Username"
                className="sa-pf2-input"
              />
            </label>
            {updated === "username" && <p className="text-sm font-medium text-green-400">Username updated.</p>}
            {error && (errorKey === "username" || errorKey === "taken") && (
              <p className="text-sm font-medium text-rahoot-red">{error}</p>
            )}
            <button type="submit" className="sa-pf2-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
                <path d="M5 4.5h11l3.5 3.5v11a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V6A1.5 1.5 0 0 1 5 4.5Z" />
                <path d="M7.5 4.5v4.5h7.5V4.5M7.5 20.5v-6h9v6" />
              </svg>
              Save changes
            </button>
          </form>
        </section>

        {/* ---------------- Password ---------------- */}
        <section>
          <h2 className="sa-pf2-title">
            <span className="sa-pf2-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden>
                <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
                <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14.5v2.5" />
              </svg>
            </span>
            Change password
          </h2>
          <form action={updateAdminPassword} className="mt-5 flex flex-col gap-3">
            <PasswordInput name="password" required minLength={8} placeholder="New Password" ariaLabel="New password" className="sa-pf2-input" />
            <PasswordInput
              name="confirmPassword"
              required
              minLength={8}
              placeholder="Confirm New Password"
              ariaLabel="Confirm new password"
              className="sa-pf2-input"
            />
            {error && (errorKey === "weak" || errorKey === "mismatch") && (
              <p className="text-sm font-medium text-rahoot-red">{error}</p>
            )}
            <button type="submit" className="sa-pf2-btn mt-1">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
                <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
                <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
              </svg>
              Change password
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
