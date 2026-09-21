// No "server-only" import here (unlike most of src/lib) - this file is also
// imported directly by prisma/seed.ts, which runs under plain Node via tsx,
// outside Next's bundler, the same reason session-core.ts avoids it.
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

/** Hashes a password for storage as `<salt>:<derivedKeyHex>`. Never store the raw password. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

/** Verifies a password against a hash produced by `hashPassword`. Constant-time comparison. */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, hashHex] = storedHash.split(":");
  if (!salt || !hashHex) return false;

  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  const stored = Buffer.from(hashHex, "hex");
  if (derived.length !== stored.length) return false;
  return timingSafeEqual(derived, stored);
}
