import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

// This page has no per-request data, so Next would otherwise mark it fully
// static and send a year-long s-maxage - which Firebase Hosting's CDN then
// caches at the edge with no way to bust it on a redeploy short of a
// version change (see the Cloud Run + Firebase Hosting caching gotcha this
// fixes: a stale homepage kept being served after multiple deploys because
// of exactly this). Forcing it dynamic keeps every deploy visible immediately.
export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-background px-6 py-16 text-rahoot-ink">
      <div className="fixed right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-lg text-center">
        <Logo size={48} priority className="mx-auto" />
        <p className="mt-5 text-lg text-rahoot-muted">
          Self-paced quizzes after every lecture, one attempt each, a cumulative leaderboard for the whole course.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link href="/login" className="card flex flex-col p-6 text-center hover:border-rahoot-red">
            <h2 className="text-lg font-bold">Student login</h2>
            <p className="mt-1 flex-1 text-sm text-rahoot-muted">
              Log in with the account your instructor set up for you.
            </p>
            <span className="btn btn-primary mt-4">Log in</span>
          </Link>
          <Link href="/admin/login" className="card flex flex-col p-6 text-center hover:border-rahoot-red">
            <h2 className="text-lg font-bold">Admin login</h2>
            <p className="mt-1 flex-1 text-sm text-rahoot-muted">
              Create quizzes, manage students, and review results.
            </p>
            <span className="btn btn-outline mt-4">Log in</span>
          </Link>
        </div>
      </div>

      <div className="mt-16 flex items-center gap-6 text-sm text-rahoot-muted">
        <Link href="/join" className="hover:text-rahoot-ink hover:underline">
          Join a live session
        </Link>
        <Link href="/homeworks/new" className="hover:text-rahoot-ink hover:underline">
          Host a live session
        </Link>
      </div>
    </main>
  );
}
