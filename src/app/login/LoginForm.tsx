"use client";

import { useFormStatus } from "react-dom";
import { PasswordInput } from "@/components/PasswordInput";
import { login } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="sa-login-cta" disabled={pending} aria-busy={pending}>
      {pending ? (
        <>
          <span className="sa-login-spinner" aria-hidden />
          <span>Entering…</span>
        </>
      ) : (
        <>
          <span>Enter SkillArena</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </>
      )}
    </button>
  );
}

export function LoginForm({ from, error }: { from: string; error: string | null }) {
  return (
    <form action={login} className="sa-login-form" noValidate={false}>
      <input type="hidden" name="from" value={from} />

      <div className="sa-login-field">
        <label htmlFor="login-username">Username</label>
        <input
          id="login-username"
          type="text"
          name="username"
          required
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="username"
          className="sa-login-input"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
        />
      </div>

      <div className="sa-login-field">
        <label htmlFor="login-password">Password</label>
        <PasswordInput
          id="login-password"
          name="password"
          required
          autoComplete="current-password"
          className="sa-login-input"
          ariaDescribedBy={error ? "login-error" : undefined}
        />
      </div>

      <p id="login-error" role="alert" aria-live="polite" className="sa-login-error">
        {error}
      </p>

      <SubmitButton />
    </form>
  );
}
