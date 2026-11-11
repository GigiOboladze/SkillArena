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

/**
 * Forgets every recorded attempt for `key`. Used after a SUCCESSFUL login so
 * a legitimate user who mistyped their password a few times isn't left
 * carrying those failures - only genuinely failed attempts accumulate toward
 * the limit.
 */
export function clearRateLimit(key: string): void {
  hits.delete(key);
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

// Same idea as getIncoRateLimitKey, for HootArena's own PIN-join attempts -
// a separate cookie since the two features are unrelated, but identical
// reasoning: PIN-guessing needs a per-browser rate limit key, and there's no
// logged-in account here to key it by instead (HootArena players have no
// SkillArena account at all).
const HOOT_RATE_LIMIT_COOKIE = "hoot_rl";

export async function getHootRateLimitKey(): Promise<string> {
  const store = await cookies();
  const existing = store.get(HOOT_RATE_LIMIT_COOKIE)?.value;
  if (existing) return existing;

  const token = generateToken();
  store.set(HOOT_RATE_LIMIT_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return token;
}

// --- Login throttling ---
//
// Password verification is scrypt, which is deliberately CPU-expensive, and
// this app must run as a single instance (see server.ts) - so an unthrottled
// login endpoint is both a credential-brute-force surface and a CPU-exhaustion
// DoS against the whole deployment.
//
// Two independent limits, because each blunts a different attack and neither
// is sufficient alone:
//
//  - PER USERNAME (`loginAttemptKeyForUsername`) is the robust one: it cannot
//    be bypassed by clearing cookies, and it is what stops a sustained
//    guessing run against one specific account - including the Super Admin.
//    Only FAILED attempts count, and a successful login clears the counter
//    (see clearRateLimit), so a legitimate user who mistypes a few times is
//    never affected in practice.
//  - PER BROWSER (`getAuthRateLimitKey`) catches the other shape: spraying one
//    password across many different usernames, which would never trip a
//    per-username limit. Clearable by design, so it is a speed bump for the
//    CPU cost rather than a security boundary.
//
// Deliberate trade-off: the per-username limit means an attacker who knows a
// username can keep that account throttled for the window length. That is the
// standard trade (every major platform makes it), and the alternative - no
// limit at all - leaves both the brute-force and the DoS surface wide open.
// The window is kept short and the allowance generous so real users are not
// disrupted.
export const LOGIN_MAX_FAILURES_PER_USERNAME = 10;
export const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_ATTEMPTS_PER_BROWSER = 30;
export const LOGIN_BROWSER_WINDOW_MS = 10 * 60 * 1000;

const AUTH_RATE_LIMIT_COOKIE = "auth_rl";

export function loginAttemptKeyForUsername(scope: "admin" | "student" | "account", username: string): string {
  return `login:${scope}:user:${username.trim().toLowerCase()}`;
}

export async function getAuthRateLimitKey(): Promise<string> {
  const store = await cookies();
  const existing = store.get(AUTH_RATE_LIMIT_COOKIE)?.value;
  if (existing) return existing;

  const token = generateToken();
  store.set(AUTH_RATE_LIMIT_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return token;
}

// --- Public legacy LIVE/ASYNC forms ---
//
// Creating a homework and joining one need no account (by design - see
// homeworks/actions.ts), so without a limit they are open database-write
// endpoints on a public URL. Same per-browser cookie approach as above: a
// speed bump against scripted floods, not an identity.
const PUBLIC_FORM_RATE_LIMIT_COOKIE = "pub_rl";

export async function getPublicFormRateLimitKey(): Promise<string> {
  const store = await cookies();
  const existing = store.get(PUBLIC_FORM_RATE_LIMIT_COOKIE)?.value;
  if (existing) return existing;

  const token = generateToken();
  store.set(PUBLIC_FORM_RATE_LIMIT_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return token;
}
