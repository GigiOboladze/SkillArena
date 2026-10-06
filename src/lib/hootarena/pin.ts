import "server-only";
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";

const PIN_MIN = 100000;
const PIN_MAX = 999999; // inclusive upper bound for randomInt below
const MAX_ATTEMPTS = 20;

/**
 * A fresh 6-digit numeric Game PIN, guaranteed unique against every existing
 * HootGame row (not just active ones - a finished game's PIN is never
 * recycled, so a student who mistypes a just-ended game's PIN gets a clean
 * "that PIN doesn't exist/has ended" rather than accidentally landing in an
 * unrelated new game that happened to reuse the number).
 *
 * Uses Node's cryptographically secure `randomInt` (not `Math.random()`) -
 * the PIN is the sole access credential for joining a game, so it needs to
 * be unguessable, not just "looks random". Collisions are vanishingly
 * unlikely (up to 900,000 possible PINs against a realistic handful of
 * concurrent/historical games) but are still handled by retrying against a
 * fresh random draw, never by perturbing a fixed sequence.
 */
export async function generateUniqueHootPin(): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const pin = String(randomInt(PIN_MIN, PIN_MAX + 1));
    const existing = await prisma.hootGame.findUnique({ where: { pin }, select: { id: true } });
    if (!existing) return pin;
  }
  throw new Error("Could not generate a unique HootArena PIN after multiple attempts");
}
