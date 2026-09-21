import "server-only";
import {
  adminSessionCookieName,
  verifyAdminToken,
  adminFromEnvelope,
  studentUserFromEnvelope,
  newAdminEntry,
  newStudentUserEntry,
  type AdminSessionPayload,
  type StudentUserSessionPayload,
} from "@/lib/session-core";
import { readSessionEnvelope, writeSessionEnvelope } from "@/lib/session-envelope";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import type { User } from "@/generated/prisma/client";

export {
  adminSessionCookieName,
  verifyAdminToken,
  type AdminSessionPayload,
  type StudentUserSessionPayload,
};

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

/** Looks up a User by username and verifies the password against its stored hash, restricted to the given role(s). */
async function verifyCredentials(
  username: string,
  password: string,
  roles: readonly ("SUPER_ADMIN" | "ADMIN" | "STUDENT")[]
): Promise<User | null> {
  const user = await prisma.user.findUnique({ where: { username: normalizeUsername(username) } });
  if (!user || !roles.includes(user.role)) return null;
  return (await verifyPassword(password, user.passwordHash)) ? user : null;
}

// Both admin levels share the same login form/session - the distinction
// between them is a permission check made after login (see requireSuperAdmin
// in the admin-management/profile actions), not a separate credential flow.
export async function verifyAdminCredentials(username: string, password: string) {
  return verifyCredentials(username, password, ["SUPER_ADMIN", "ADMIN"]);
}

export async function verifyStudentCredentials(username: string, password: string) {
  return verifyCredentials(username, password, ["STUDENT"]);
}

export async function createAdminSession(userId: string, username: string, sessionVersion: number) {
  const envelope = await readSessionEnvelope();
  envelope.admin = newAdminEntry(userId, username, sessionVersion);
  await writeSessionEnvelope(envelope);
}

export async function destroyAdminSession() {
  const envelope = await readSessionEnvelope();
  delete envelope.admin;
  await writeSessionEnvelope(envelope);
}

/**
 * Verifies the admin sub-session for the *current request* - both that the
 * JWT is valid/unexpired AND that its embedded sessionVersion still matches
 * the account's current one in the database. That second check is what
 * makes a password change (self-service or admin-issued) sign a session out
 * everywhere, not just in the browser that changed it: every other device's
 * cookie still carries the pre-change version number forever (JWTs can't be
 * edited after issuing), so it stops verifying the moment the DB counter
 * moves. Deliberately hits the database on every call, unlike a plain JWT
 * check - the only way revocation can work for an otherwise-stateless
 * session - but every caller of this function already goes on to touch the
 * database for the action it's guarding, so this is not a new class of cost.
 */
export async function getAdminSession(): Promise<AdminSessionPayload | null> {
  const session = adminFromEnvelope(await readSessionEnvelope());
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { sessionVersion: true } });
  if (!user || user.sessionVersion !== session.sv) return null;
  return { userId: session.userId, username: session.username };
}

export async function createStudentUserSession(userId: string, username: string, sessionVersion: number) {
  const envelope = await readSessionEnvelope();
  envelope.studentUser = newStudentUserEntry(userId, username, sessionVersion);
  await writeSessionEnvelope(envelope);
}

export async function destroyStudentUserSession() {
  const envelope = await readSessionEnvelope();
  delete envelope.studentUser;
  await writeSessionEnvelope(envelope);
}

/** Same sessionVersion check as getAdminSession, for the logged-in-student sub-session. */
export async function getStudentUserSession(): Promise<StudentUserSessionPayload | null> {
  const session = studentUserFromEnvelope(await readSessionEnvelope());
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { sessionVersion: true } });
  if (!user || user.sessionVersion !== session.sv) return null;
  return { userId: session.userId, username: session.username };
}

/** Convenience: the full current student User row, or null if not logged in as a student. */
export async function getCurrentStudent(): Promise<User | null> {
  const session = await getStudentUserSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  return user && user.role === "STUDENT" ? user : null;
}

/** Convenience: the full current admin User row (either level), or null if not logged in as an admin. */
export async function getCurrentAdmin(): Promise<User | null> {
  const session = await getAdminSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  return user && (user.role === "ADMIN" || user.role === "SUPER_ADMIN") ? user : null;
}

/** Convenience: the full current Super Admin User row, or null if the current admin isn't the Super Admin. */
export async function getCurrentSuperAdmin(): Promise<User | null> {
  const admin = await getCurrentAdmin();
  return admin && admin.role === "SUPER_ADMIN" ? admin : null;
}
