import "server-only";
import { customAlphabet } from "nanoid";

/**
 * A short-lived, server-side holding place for a freshly generated or
 * admin-chosen student password, so it can be shown once on the page AFTER a
 * redirect without ever travelling in the URL.
 *
 * Why this exists: these actions used to redirect to `?password=<plaintext>`.
 * A query string is the worst possible carrier for a credential - it lands in
 * the admin's browser history and address bar, in any reverse-proxy or
 * platform access log that records query strings, and in the `Referer` header
 * of every subsequent request made from that page. The password itself now
 * never leaves the server; only this opaque, single-purpose, expiring token
 * does.
 *
 * In-memory on purpose. This app runs as one long-lived Node process (see
 * server.ts), the same reason src/lib/rate-limit.ts keeps its counters in a
 * module-level Map - so a Map is a real store here, not a no-op. A restart
 * simply drops any pending reveal, which is the safe failure direction: the
 * admin re-issues the password rather than a stale secret lingering anywhere.
 *
 * Reads deliberately do NOT consume the token. The reveal page must survive a
 * refresh or a back-navigation (the UI tells the admin to write the password
 * down), so expiry is by TTL only. The token is unguessable and the window is
 * short, so the exposure is far smaller than the query string it replaces.
 */
const TTL_MS = 10 * 60 * 1000;

type Entry = { value: string; expiresAt: number };

const flashes = new Map<string, Entry>();
const generateToken = customAlphabet("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 24);

function prune(now = Date.now()) {
  for (const [token, entry] of flashes) {
    if (entry.expiresAt <= now) flashes.delete(token);
  }
}

/** Stores `value` and returns the opaque token used to retrieve it. */
export function putPasswordFlash(value: string): string {
  prune();
  const token = generateToken();
  flashes.set(token, { value, expiresAt: Date.now() + TTL_MS });
  return token;
}

/** The stored password for `token`, or null if it never existed or has expired. */
export function readPasswordFlash(token: string | null | undefined): string | null {
  if (!token) return null;
  const entry = flashes.get(token);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    flashes.delete(token);
    return null;
  }
  return entry.value;
}

// Periodic sweep so an unread flash cannot linger past its TTL even if no
// further password is ever issued. unref()'d so it never holds the process
// open, matching rate-limit.ts.
setInterval(() => prune(), TTL_MS).unref?.();
