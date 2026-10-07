import { redirect } from "next/navigation";
import { getHootPlayerForGame } from "@/lib/hootarena/player-session";
import { HootPlayClient } from "./HootPlayClient";

export default async function HootArenaPlayPage({ params }: PageProps<"/hootarena/play/[id]">) {
  const { id } = await params;

  const player = await getHootPlayerForGame(id);
  if (!player) redirect("/hootarena");

  return <HootPlayClient gameId={id} playerId={player.id} clientToken={player.clientToken} username={player.username} />;
}
