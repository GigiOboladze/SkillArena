// Deliberately NOT "server-only": this module is imported both by Next.js
// server actions/pages AND by server.ts, which runs under plain Node (via
// tsx) outside Next's bundler - "server-only" throws unconditionally in that
// context (see session-core.ts's own comment for the identical reason it
// avoids the guard too).
import { prisma } from "@/lib/prisma";
import type { User } from "@/generated/prisma/client";

/**
 * Whether `admin` may manage (edit questions, delete, host) a given
 * HootArena game. HootArena has no program/subject concept at all - a game
 * is just "whoever has the PIN/QR can join" - so admin-side access is
 * ownership-based instead: the Super Admin may manage any game, a regular
 * Admin only the ones they created. Never trust a client-supplied game id
 * over this check.
 */
export function canAdminManageGame(admin: Pick<User, "id" | "role">, game: { hostId: string }): boolean {
  return admin.role === "SUPER_ADMIN" || admin.id === game.hostId;
}

/**
 * Loads a HootGame and verifies `admin` may manage it. Returns null if the
 * game doesn't exist or the admin isn't authorized; callers decide whether
 * that's a 404, a redirect, or a socket ack(false).
 */
export async function loadHootGameForAdmin(admin: Pick<User, "id" | "role">, gameId: string) {
  const game = await prisma.hootGame.findUnique({ where: { id: gameId } });
  if (!game) return null;
  if (!canAdminManageGame(admin, game)) return null;
  return game;
}
