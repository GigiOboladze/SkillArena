"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Root error boundary. Before this existed, any unexpected throw anywhere in
 * the app rendered Next's unstyled default error page - which also risked
 * showing a raw Prisma message to a student or an admin.
 *
 * Deliberately minimal and on-brand: it reuses the existing .card/.btn classes
 * and theme tokens rather than introducing new design, and it never displays
 * `error.message`, only the digest. Next already strips server error messages
 * in production builds, but not showing them at all means a development-mode
 * screenshot can't leak internals either.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The app has no error-reporting service wired up; the server console is
    // the only sink today. Logging the digest here is what makes a user report
    // ("I saw error a1b2c3") traceable back to a server log line.
    console.error("Unhandled application error", error.digest ?? "", error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <div className="card max-w-md p-8">
        <h1 className="text-xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-sm text-rahoot-muted">
          This page hit an unexpected error. Nothing you were working on has been lost - you can try again,
          or go back and re-open it.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-rahoot-muted">
            Reference: {error.digest}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className="btn btn-primary">
            Try again
          </button>
          <Link href="/" className="btn btn-outline">
            Go to the start page
          </Link>
        </div>
      </div>
    </main>
  );
}
