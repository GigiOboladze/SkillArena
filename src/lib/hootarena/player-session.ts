import "server-only";
import { prisma } from "@/lib/prisma";
import { withHootPlayerEntry } from "@/lib/session-core";
import { readSessionEnvelope, writeSessionEnvelope } from "@/lib/session-envelope";

// A HootArena player "session" is just an entry in the shared session
// envelope remembering which HootPlayer row is theirs for one specific
// game - there is no account, no password. Re-opening the game link on the
// same device resumes the same entry instead of creating a second player
// under a new (or colliding) nickname. Mirrors student-session.ts exactly,
// for the same reason - see that file's own comment.

export async function setHootPlayerCookie(gameId: string, playerId: string, clientToken: string) {
  const envelope = await readSessionEnvelope();
  await writeSessionEnvelope(withHootPlayerEntry(envelope, gameId, { playerId, clientToken }));
}

export async function getHootPlayerForGame(gameId: string) {
  const envelope = await readSessionEnvelope();
  const entry = envelope.hootPlayers?.[gameId];
  if (!entry) return null;

  return prisma.hootPlayer.findFirst({
    where: { id: entry.playerId, gameId, clientToken: entry.clientToken },
  });
}
