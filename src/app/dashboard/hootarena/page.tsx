import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentStudent } from "@/lib/session";
import { joinHootGameByPin } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  format: "Enter the 6-digit Game PIN your teacher gave you.",
  notfound: "That PIN doesn't match any game. Double-check with your teacher.",
  ended: "That game has already ended.",
  ineligible: "You're not eligible to join that game.",
  ratelimit: "Too many attempts - wait a minute and try again.",
};

export default async function HootArenaEntryPage({
  searchParams,
}: PageProps<"/dashboard/hootarena">) {
  const student = await getCurrentStudent();
  if (!student) redirect("/login");

  // If this student is already in an active (non-finished) game - on this
  // device or another - reopening HootArena restores them straight into it
  // instead of showing a bare PIN box again (see spec: reconnect must land
  // back in the right place, not force rejoining).
  const activePlayer = await prisma.hootPlayer.findFirst({
    where: { userId: student.id, game: { status: { not: "FINISHED" } } },
    select: { gameId: true },
  });
  if (activePlayer) {
    redirect(`/dashboard/hootarena/play/${activePlayer.gameId}`);
  }

  const search = await searchParams;
  const error = typeof search?.error === "string" ? ERROR_MESSAGES[search.error] ?? null : null;

  return (
    <div className="mx-auto flex max-w-sm flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-sm font-bold uppercase tracking-wide text-rahoot-red">HootArena</p>
      <h1 className="mt-1 text-2xl font-bold">Join a game</h1>
      <p className="mt-2 text-sm text-rahoot-muted">Enter the Game PIN your teacher shared.</p>

      <form action={joinHootGameByPin} className="mt-8 flex w-full flex-col gap-3">
        <input
          name="pin"
          required
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          minLength={6}
          placeholder="123456"
          autoFocus
          autoComplete="off"
          className="input text-center text-3xl font-black tracking-[0.3em]"
        />
        {error && <p className="text-sm font-medium text-rahoot-red">{error}</p>}
        <button type="submit" className="btn btn-primary mt-2">
          Join
        </button>
      </form>
    </div>
  );
}
