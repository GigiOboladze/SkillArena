import Link from "next/link";
import { Logo } from "@/components/Logo";
import { goToJoinCode } from "./actions";

export default async function JoinPage({
  searchParams,
}: PageProps<"/join">) {
  const params = await searchParams;
  const hasError = params?.error === "empty";

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm text-center">
        <Link href="/" className="inline-block">
          <Logo size={44} priority className="mx-auto" />
        </Link>
        <h1 className="mt-6 text-2xl font-bold">Enter your join code</h1>
        <p className="mt-1 text-sm text-rahoot-muted">
          Your teacher shows this next to the QR code.
        </p>

        <form action={goToJoinCode} className="mt-8 flex flex-col gap-3">
          <input
            name="code"
            required
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={8}
            placeholder="e.g. K7QX2M"
            className="input text-center text-2xl font-black tracking-[0.3em] uppercase"
          />
          {hasError && (
            <p className="text-sm font-medium text-rahoot-red">
              Please enter a join code.
            </p>
          )}
          <button type="submit" className="btn btn-primary">
            Continue
          </button>
        </form>
      </div>
    </main>
  );
}
