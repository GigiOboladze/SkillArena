import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getCurrentStaff, getCurrentStudent } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Enter SkillArena" };

const ERRORS: Record<string, string> = {
  invalid: "Incorrect username or password.",
  throttled: "Too many login attempts. Wait a few minutes and try again.",
};

/** The single login for students and every staff role. */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const from = typeof params?.from === "string" ? params.from : "";
  const errorKey = typeof params?.error === "string" ? params.error : "";
  const passwordChanged = params?.passwordChanged === "1";

  // Already signed in: offer a way back to the workspace, but keep the form
  // so a shared classroom computer can switch accounts (signing in replaces
  // the current session).
  const [staff, student] = passwordChanged ? [null, null] : await Promise.all([getCurrentStaff(), getCurrentStudent()]);
  const signedIn = staff ?? student;

  return (
    <main className="sa-login">
      <div className="sa-login-bg" aria-hidden>
        <span className="sa-login-glow is-a" />
        <span className="sa-login-glow is-b" />
        <span className="sa-login-grid" />
      </div>

      <div className="sa-login-theme">
        <ThemeToggle />
      </div>

      <section className="sa-login-card" aria-labelledby="login-heading">
        <Logo size={52} priority className="sa-login-logo" />

        <h1 id="login-heading" className="sa-login-title">
          <span>Learn</span>
          <span className="sa-login-slash" aria-hidden>/</span>
          <span>Compete</span>
          <span className="sa-login-slash" aria-hidden>/</span>
          <span className="sa-login-accent">Grow</span>
        </h1>
        <p className="sa-login-sub">Sign in with your SkillArena account.</p>

        {signedIn && (
          <p className="sa-login-notice is-session" role="status">
            Signed in as <strong>@{signedIn.username}</strong>.{" "}
            <Link href={staff ? "/admin" : "/dashboard"}>Continue →</Link>
          </p>
        )}
        {passwordChanged && (
          <p className="sa-login-notice" role="status">
            Password changed. Sign in again with your new password.
          </p>
        )}

        <LoginForm from={from} error={ERRORS[errorKey] ?? null} />
      </section>

      <p className="sa-login-tagline">Arena Awaits.</p>
    </main>
  );
}
