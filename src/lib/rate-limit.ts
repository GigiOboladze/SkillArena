import "server-only";
import { cookies } from "next/headers";
import { customAlphabet } from "nanoid";

// Generic in-memory sliding-window limiter. Per-process only - this app
// runs as a single long-lived Node process (see server.ts), not multiple
// serverless instances, so an in-memory Map is a real, if not distributed,
// limit rather than a no-op; adding Redis or similar for a ~70-concurrent-
// user classroom tool would be complexity this project doesn't need.
const hits = new Map<string, number[]>();

/** Returns true if `key` is currently allowed another attempt under `max` per `windowMs`, recording this attempt if so. */
export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

// Opportunistic cleanup so `hits` doesn't grow forever - runs on a fraction
// of calls rather than a timer, so it costs nothing when the app is idle.
setInterval(
  () => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [key, timestamps] of hits) {
      const kept = timestamps.filter((t) => t > cutoff);
      if (kept.length === 0) hits.delete(key);
      else hits.set(key, kept);
    }
  },
  10 * 60 * 1000
).unref?.();

const RATE_LIMIT_COOKIE = "inco_rl";
const generateToken = customAlphabet("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 24);

/**
 * An anonymous, opaque per-browser token used ONLY to key the in-memory
 * rate limiter above for INCO's submit/status-check endpoints - deliberately
 * NOT the request's IP address. INCO's whole point is protecting the
 * sender's identity, and an IP is quasi-identifying in a way an
 * unlinkable random cookie is not; this value is never stored anywhere but
 * this cookie and the in-memory hit counter above (keyed by its value, not
 * by who holds it), is never written to the database, and is never
 * associated with any IncoSubmission row.
 */
export async function getIncoRateLimitKey(): Promise<string> {
  const store = await cookies();
  const existing = store.get(RATE_LIMIT_COOKIE)?.value;
  if (existing) return existing;

  const token = generateToken();
  store.set(RATE_LIMIT_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return token;
}
