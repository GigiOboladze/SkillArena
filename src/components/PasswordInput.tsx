"use client";

import { useState } from "react";

/** Password field with a show/hide (eye) toggle. Behaves exactly like a plain password input otherwise. */
export function PasswordInput({
  id,
  ariaDescribedBy,
  name,
  className,
  minLength,
  required,
  autoComplete = "new-password",
  placeholder,
  ariaLabel,
}: {
  name: string;
  className?: string;
  minLength?: number;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
  ariaLabel?: string;
  id?: string;
  ariaDescribedBy?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative block">
      <input
        type={visible ? "text" : "password"}
        id={id}
        aria-describedby={ariaDescribedBy}
        name={name}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={`${className ?? ""} !pr-12`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-rahoot-muted hover:text-rahoot-ink"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
          <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="2.75" />
          {!visible && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </span>
  );
}
