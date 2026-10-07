import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/session";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  LOBBY: { label: "Lobby", className: "badge-neutral" },
  QUESTION: { label: "Live", className: "badge-success" },
  REVEAL: { label: "Live", className: "badge-success" },
  LEADERBOARD: { label: "Live", className: "badge-success" },
};

export default async function AdminHootArenaPage() {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  // No program/subject/group concept at all - HootArena is PIN/QR-joinable
  // by anyone, so every admin sees every active game (same "shared staff
  // room" model as who gets to see this list; ownership only gates editing
  // rights, via canAdminManageGame). No history view (see spec): only games
  // that haven't finished yet are ever listed here - a FINISHED game drops
  // off this page the moment it ends, and isn't joinable anymore either.
  const games = await prisma.hootGame.findMany({
    where: { status: { not: "FINISHED" } },
    orderBy: { createdAt: "desc" },
    include: { host: { select: { username: true } }, _count: { select: { questions: true, players: true } } },
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">HootArena</h1>
        <Link href="/admin/hootarena/new" className="btn btn-primary">
          + New game
        </Link>
      </div>
      <p className="mt-1 text-sm text-rahoot-muted">
        Live, Kahoot-style quiz games - join by PIN or QR code, no student account needed. A finished game disappears
        from this list automatically - there&apos;s no history view.
      </p>

      {games.length === 0 ? (
        <p className="mt-8 text-rahoot-muted">No active games. Create one to get a Game PIN students can join with.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {games.map((game) => {
            const statusInfo = STATUS_LABELS[game.status] ?? STATUS_LABELS.LOBBY;
            return (
              <li key={game.id}>
                <Link
                  href={game.status === "LOBBY" ? `/admin/hootarena/${game.id}` : `/admin/hootarena/${game.id}/host`}
                  className="card flex items-center justify-between p-4 hover:border-rahoot-red"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{game.title}</span>
                      <span className={`badge ${statusInfo.className}`}>{statusInfo.label}</span>
                      <span className="badge bg-rahoot-red-light text-rahoot-red-dark">PIN {game.pin}</span>
                    </div>
                    <p className="mt-1 text-sm text-rahoot-muted">
                      Host: {game.host.username} &middot; {game._count.questions} question
                      {game._count.questions === 1 ? "" : "s"} &middot; {game._count.players} player
                      {game._count.players === 1 ? "" : "s"}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
