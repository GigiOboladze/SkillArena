import Link from "next/link";
import { Logo } from "@/components/Logo";
import { createHomework } from "../actions";

export default async function NewHomeworkPage({
  searchParams,
}: PageProps<"/homeworks/new">) {
  const params = await searchParams;
  const hasError = params?.error === "title";

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-10">
      <Link href="/" className="mx-auto">
        <Logo size={40} priority />
      </Link>
      <h1 className="mt-6 text-center text-2xl font-bold">New homework</h1>
      <p className="mt-1 text-center text-sm text-rahoot-muted">
        No account needed - name it, and this browser will remember it&apos;s yours to manage.
      </p>

      <form action={createHomework} className="card mt-6 flex flex-col gap-4 p-6">
        <label className="text-sm font-semibold">
          Title
          <input name="title" required maxLength={120} className="input mt-1" autoFocus />
        </label>
        <label className="text-sm font-semibold">
          Description (optional)
          <textarea name="description" maxLength={500} rows={3} className="input mt-1" />
        </label>

        <fieldset className="text-sm font-semibold">
          Mode
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="card flex cursor-pointer flex-col gap-1 p-4 has-[:checked]:border-rahoot-red has-[:checked]:bg-rahoot-red-light">
              <span className="flex items-center gap-2 font-bold">
                <input type="radio" name="mode" value="ASYNC" defaultChecked />
                Self-paced homework
              </span>
              <span className="font-normal text-rahoot-muted">
                Students scan the QR code whenever and work through it on their own.
              </span>
            </label>
            <label className="card flex cursor-pointer flex-col gap-1 p-4 has-[:checked]:border-rahoot-red has-[:checked]:bg-rahoot-red-light">
              <span className="flex items-center gap-2 font-bold">
                <input type="radio" name="mode" value="LIVE" />
                Live hosted session
              </span>
              <span className="font-normal text-rahoot-muted">
                Kahoot-style - you control the pace, everyone answers together.
              </span>
            </label>
          </div>
        </fieldset>

        {hasError && (
          <p className="text-sm font-medium text-rahoot-red">Please enter a title.</p>
        )}

        <button type="submit" className="btn btn-primary mt-2">
          Create homework
        </button>
      </form>
    </main>
  );
}
