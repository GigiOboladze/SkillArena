"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { generateClientToken } from "@/lib/tokens";
import { setHootPlayerCookie } from "@/lib/hootarena/player-session";
import { checkRateLimit, getHootRateLimitKey } from "@/lib/rate-limit";

export async function joinHootGame(gameId: string, formData: FormData) {
  const game = await prisma.hootGame.findUnique({ where: { id: gameId } });
  if (!game) redirect("/hootarena?error=empty");

  const username = String(formData.get("username") || "").trim().slice(0, 40);
  if (!username) redirect(`/hootarena/join/${game.pin}?error=name`);
  if (game.status === "FINISHED") redirect(`/hootarena/join/${game.pin}`);

  // Keyed by an anonymous per-browser cookie, not IP - a shared classroom
  // network would otherwise rate-limit every student behind the same
  // address together. There's no account to key this by instead (HootArena
  // players have none); 10 attempts/minute comfortably covers retyping a
  // taken nickname a few times without opening a meaningful spam window.
  const rateLimitKey = await getHootRateLimitKey();
  if (!checkRateLimit(`hoot-join:${rateLimitKey}`, 10, 60_000)) {
    redirect(`/hootarena/join/${game.pin}?error=rate`);
  }

  // Case-insensitive "name taken" check, so "Alice" and "alice" don't both
  // slip in and confuse everyone - the DB's own exact-match
  // @@unique([gameId, username]) below is the real backstop against a
  // genuine duplicate, including under a race between two near-simultaneous
  // submissions of the identical name.
  const existing = await prisma.hootPlayer.findFirst({
    where: { gameId, username: { equals: username, mode: "insensitive" } },
  });
  if (existing) {
    redirect(`/hootarena/join/${game.pin}?error=taken`);
  }

  const clientToken = generateClientToken();
  let player;
  try {
    player = await prisma.hootPlayer.create({ data: { gameId, username, clientToken, score: 0 } });
  } catch {
    // Unique constraint race - two people submitted the identical name at
    // the same instant. Same friendly outcome as the pre-check above.
    redirect(`/hootarena/join/${game.pin}?error=taken`);
  }

  await setHootPlayerCookie(gameId, player.id, clientToken);
  redirect(`/hootarena/play/${gameId}`);
}
