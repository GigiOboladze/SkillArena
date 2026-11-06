import Link from "next/link";

/**
 * Branded 404. `notFound()` is used extensively across this app - it is the
 * deliberate response to both "doesn't exist" and "you may not see this" (see
 * e.g. requireQuizAccess, requireAdminForStudent, /attachments/[id]) - so this
 * page is reached often, and previously rendered Next's generic off-brand one.
 *
 * The wording stays intentionally vague about whether the thing exists,
 * because several callers rely on a 404 not confirming that an id is real.
 */
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <div className="card max-w-md p-8">
        <h1 className="text-xl font-bold">Not found</h1>
        <p className="mt-2 text-sm text-rahoot-muted">
          This page doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/dashboard" className="btn btn-primary">
            My dashboard
          </Link>
          <Link href="/" className="btn btn-outline">
            Start page
          </Link>
        </div>
      </div>
    </main>
  );
}
