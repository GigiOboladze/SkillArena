import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentAdmin } from "@/lib/session";
import { createHootGame } from "../actions";

const ERROR_MESSAGES: Record<string, string> = {
  title: "Please enter a title.",
};

export default async function NewHootGamePage({
  searchParams,
}: PageProps<"/admin/hootarena/new">) {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const search = await searchParams;
  const error = typeof search?.error === "string" ? ERROR_MESSAGES[search.error] ?? null : null;

  return (
    <div className="mx-auto max-w-lg">
      <Link href="/admin/hootarena" className="text-sm text-rahoot-red hover:underline">
        &larr; Back to HootArena
      </Link>
      <h1 className="mt-2 text-2xl font-bold">New HootArena game</h1>
      <p className="mt-1 text-sm text-rahoot-muted">
        Give it a name, then add questions. You&apos;ll get a 6-digit Game PIN and a QR code - anyone with either can
        join by picking a nickname, no account needed.
      </p>

      <form action={createHootGame} className="card mt-6 flex flex-col gap-3 p-6">
        <label className="text-sm font-semibold">
          Game title
          <input
            name="title"
            required
            maxLength={120}
            placeholder="Chapter 3 Review"
            className="input mt-1"
            autoFocus
          />
        </label>
        {error && <p className="text-sm font-medium text-rahoot-red">{error}</p>}
        <button type="submit" className="btn btn-primary mt-2">
          Create game
        </button>
      </form>
    </div>
  );
}
