import { SignJWT, jwtVerify } from "jose";

// Pure JWT/envelope helpers with no dependency on "next/headers" or the
// "server-only" package, so this file can be safely imported both by
// Next.js route/action code AND by server.ts (which runs under plain Node
// via tsx, outside of Next's bundler - "server-only" throws unconditionally
// in that context).
//
// Everything lives in ONE cookie, "__session", holding a single signed JSON
// envelope with an optional admin sub-session and any number of per-homework
// student sub-sessions. This is forced by Firebase Hosting: when a request
// is proxied through a Hosting rewrite to a Cloud Run backend, Firebase
// strips every cookie except one literally named "__session" before it
// reaches the app - so this app, which needs an admin session AND
// potentially several simultaneous student sessions, has to fit all of it
// into that one slot instead of one cookie per concern.

const SESSION_COOKIE_NAME = "__session";
const ENVELOPE_TTL = "30d"; // outer JWT expiry - also the effective cap on how long a student/creator session can last
const ADMIN_TTL_SECONDS = 60 * 60 * 12; // admin's own, shorter-lived expiry, checked separately below
// Safety caps so the cookie can't grow past the ~4KB browser limit - kept
// modest since both maps share the same cookie.
const MAX_STUDENT_ENTRIES = 15;
const MAX_CREATOR_ENTRIES = 15;

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

export type AdminSessionPayload = { userId: string; username: string };
// A real, persistent SkillArena student account (User row, role=STUDENT) -
// distinct from the legacy anonymous per-homework `students` map below,
// which is unrelated and kept as-is for LIVE mode / legacy self-paced joins.
export type StudentUserSessionPayload = { userId: string; username: string };
// Both session payload types above also carry `sv` (sessionVersion) once
// signed - kept out of the plain type since most callers only care about
// userId/username; session.ts reads it directly off the envelope entry to
// compare against the User row's current value (see User.sessionVersion).
export type StudentSessionEntry = { studentId: string; clientToken: string };
export type SessionEnvelope = {
  admin?: AdminSessionPayload & { exp: number; sv: number };
  studentUser?: StudentUserSessionPayload & { exp: number; sv: number };
  // Keyed by homeworkId - a student can be mid-way through several
  // different homeworks at once, each needing its own entry.
  students?: Record<string, StudentSessionEntry>;
  // Keyed by homeworkId -> that homework's creatorToken. Lets someone who
  // created a homework with no registration manage (edit, add questions,
  // host) only the ones they made, verified against Homework.creatorToken.
  creators?: Record<string, string>;
};

export function sessionCookieName() {
  return SESSION_COOKIE_NAME;
}

export function sessionCookieMaxAgeSeconds() {
  return 60 * 60 * 24 * 30; // matches ENVELOPE_TTL
}

export async function signSessionEnvelope(envelope: SessionEnvelope): Promise<string> {
  return new SignJWT({ envelope })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ENVELOPE_TTL)
    .sign(getSecretKey());
}

export async function verifySessionEnvelope(token: string): Promise<SessionEnvelope> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    const envelope = payload.envelope;
    return envelope && typeof envelope === "object" ? (envelope as SessionEnvelope) : {};
  } catch {
    return {};
  }
}

export function newAdminEntry(
  userId: string,
  username: string,
  sessionVersion: number
): NonNullable<SessionEnvelope["admin"]> {
  return { userId, username, sv: sessionVersion, exp: Math.floor(Date.now() / 1000) + ADMIN_TTL_SECONDS };
}

export function adminFromEnvelope(envelope: SessionEnvelope): (AdminSessionPayload & { sv: number }) | null {
  const admin = envelope.admin;
  if (!admin || admin.exp <= Math.floor(Date.now() / 1000)) return null;
  // `sv` defaults to 0 for a session signed before session-versioning
  // shipped - matches User.sessionVersion's own default, so a pre-existing
  // session stays valid rather than being force-logged-out by this deploy.
  return { userId: admin.userId, username: admin.username, sv: admin.sv ?? 0 };
}

// Same TTL/shape pattern as the admin sub-session, for a logged-in student's
// own SkillArena account (not the legacy anonymous per-homework join above).
const STUDENT_USER_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days - students stay logged in across a course

export function newStudentUserEntry(
  userId: string,
  username: string,
  sessionVersion: number
): NonNullable<SessionEnvelope["studentUser"]> {
  return { userId, username, sv: sessionVersion, exp: Math.floor(Date.now() / 1000) + STUDENT_USER_TTL_SECONDS };
}

export function studentUserFromEnvelope(
  envelope: SessionEnvelope
): (StudentUserSessionPayload & { sv: number }) | null {
  const su = envelope.studentUser;
  if (!su || su.exp <= Math.floor(Date.now() / 1000)) return null;
  return { userId: su.userId, username: su.username, sv: su.sv ?? 0 };
}

/** Merges `value` into `map` under `key`, evicting the oldest entry first if that would push the count over `max`. Object key insertion order is preserved for string keys, so the first remaining key is the oldest. */
function withCappedEntry<T>(
  map: Record<string, T> | undefined,
  key: string,
  value: T,
  max: number
): Record<string, T> {
  const next = { ...map, [key]: value };
  const keys = Object.keys(next);
  if (keys.length > max) {
    const oldest = keys.find((k) => k !== key);
    if (oldest) delete next[oldest];
  }
  return next;
}

export function withStudentEntry(
  envelope: SessionEnvelope,
  homeworkId: string,
  entry: StudentSessionEntry
): SessionEnvelope {
  return { ...envelope, students: withCappedEntry(envelope.students, homeworkId, entry, MAX_STUDENT_ENTRIES) };
}

export function withCreatorEntry(
  envelope: SessionEnvelope,
  homeworkId: string,
  creatorToken: string
): SessionEnvelope {
  return { ...envelope, creators: withCappedEntry(envelope.creators, homeworkId, creatorToken, MAX_CREATOR_ENTRIES) };
}

// --- Backward-compatible admin-only surface, used by server.ts (raw
// Socket.IO handshake cookies, outside Next's cookies() API) and proxy.ts
// (reads the raw cookie itself rather than through session.ts). Both only
// ever needed "cookie name in, admin payload out" - that contract is
// unchanged even though the cookie now holds a shared envelope.
export function adminSessionCookieName() {
  return SESSION_COOKIE_NAME;
}

export async function verifyAdminToken(token: string): Promise<AdminSessionPayload | null> {
  return adminFromEnvelope(await verifySessionEnvelope(token));
}
