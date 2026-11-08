import "server-only";
import { cache } from "react";
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
 * The current admin User row, verified for the *current request* - both that
 * the JWT is valid/unexpired AND that its embedded sessionVersion still
 * matches the account's current one in the database. That second check is
 * what makes a password change (self-service or admin-issued) sign a session
 * out everywhere, not just in the browser that changed it: every other
 * device's cookie still carries the pre-change version number forever (JWTs
 * can't be edited after issuing), so it stops verifying the moment the DB
 * counter moves.
 *
 * Performance: ONE query, not two. This used to fetch `sessionVersion` and
 * then fetch the same row again in full; both now come from a single read.
 * Wrapped in React's `cache()`, so within one server render the layout, the
 * page and any nested component share that one query instead of each
 * repeating it (this was 4-6 sequential round trips per page). `cache()`
 * memoizes only inside a React server render; server actions and route
 * handlers still get a fresh read on every call, so a session change inside
 * an action can never be answered from a stale value.
 */
const loadVerifiedAdmin = cache(async (): Promise<User | null> => {
  const session = adminFromEnvelope(await readSessionEnvelope());
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.sessionVersion !== session.sv) return null;
  return user.role === "ADMIN" || user.role === "SUPER_ADMIN" ? user : null;
});

export async function getAdminSession(): Promise<AdminSessionPayload | null> {
  const admin = await loadVerifiedAdmin();
  return admin ? { userId: admin.id, username: admin.username } : null;
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

/** Same sessionVersion check (and the same single cached query) as loadVerifiedAdmin, for the logged-in-student sub-session. */
const loadVerifiedStudent = cache(async (): Promise<User | null> => {
  const session = studentUserFromEnvelope(await readSessionEnvelope());
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.sessionVersion !== session.sv) return null;
  return user.role === "STUDENT" ? user : null;
});

export async function getStudentUserSession(): Promise<StudentUserSessionPayload | null> {
  const student = await loadVerifiedStudent();
  return student ? { userId: student.id, username: student.username } : null;
}

/** Convenience: the full current student User row, or null if not logged in as a student. */
export async function getCurrentStudent(): Promise<User | null> {
  return loadVerifiedStudent();
}

/** Convenience: the full current admin User row (either level), or null if not logged in as an admin. */
export async function getCurrentAdmin(): Promise<User | null> {
  return loadVerifiedAdmin();
}

/** Convenience: the full current Super Admin User row, or null if the current admin isn't the Super Admin. */
export async function getCurrentSuperAdmin(): Promise<User | null> {
  const admin = await getCurrentAdmin();
  return admin && admin.role === "SUPER_ADMIN" ? admin : null;
}
