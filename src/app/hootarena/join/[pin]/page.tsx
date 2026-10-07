import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getHootPlayerForGame } from "@/lib/hootarena/player-session";
import { joinHootGame } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  name: "Please enter a nickname.",
  taken: "That nickname is already taken in this game - try another.",
  rate: "Too many attempts - wait a minute and try again.",
};

export default async function HootJoinPinPage({
  params,
  searchParams,
}: PageProps<"/hootarena/join/[pin]">) {
  const { pin } = await params;
  const search = await searchParams;
  const errorMessage = typeof search?.error === "string" ? ERROR_MESSAGES[search.error] ?? null : null;

  const game = await prisma.hootGame.findUnique({ where: { pin } });

  if (!game) {
    return (
      <StatusScreen
        title="PIN not found"
        message={`We couldn't find a game with the PIN "${pin}". Double-check with your teacher.`}
      />
    );
  }

  // Already joined on this device? Skip straight back in.
  const existingPlayer = await getHootPlayerForGame(game.id);
  if (existingPlayer) {
    redirect(`/hootarena/play/${game.id}`);
  }

  if (game.status === "FINISHED") {
    return <StatusScreen title={game.title} message="This game has already ended." />;
  }

  const joinAction = joinHootGame.bind(null, game.id);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm text-center">
        <p className="text-sm font-bold uppercase tracking-wide text-rahoot-red">Joining</p>
        <h1 className="mt-1 text-2xl font-bold">{game.title}</h1>

        <form action={joinAction} className="mt-8 flex flex-col gap-3 text-left">
          <label className="text-sm font-semibold">
            Nickname
            <input name="username" required maxLength={40} className="input mt-1" autoFocus autoComplete="off" />
          </label>
          {errorMessage && <p className="text-sm font-medium text-rahoot-red">{errorMessage}</p>}
          <button type="submit" className="btn btn-primary mt-2">
            Join the game
          </button>
        </form>
      </div>
    </main>
  );
}

function StatusScreen({ title, message }: { title: string; message: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 max-w-sm text-rahoot-muted">{message}</p>
      <Link href="/hootarena" className="btn btn-outline mt-6">
        Try another PIN
      </Link>
    </main>
  );
}
