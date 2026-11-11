// Role -> capability matrix for every SkillArena staff role.
//
// Deny by default: a role has a capability only if it is listed here. Pages,
// server actions, socket handlers and the sidebar all ask `can()`; the data a
// capability reaches is then narrowed again by the scope helpers in
// src/lib/scope.ts. A capability says "may use this area", the scope says
// "which rows".
//
// Deliberately NOT "server-only": server.ts (plain Node, outside Next's
// bundler) imports this too, for HootArena hosting checks.
import type { UserRole } from "@/generated/prisma/enums";

export type StaffRole = Exclude<UserRole, "STUDENT">;

export const STAFF_ROLES: readonly StaffRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "LECTURER",
  "JUNIOR_CAPTAIN",
  "MIDDLE_CAPTAIN",
  "SENIOR_CAPTAIN",
  "SUCCESS_MANAGER",
];

/** Roles the Super Admin can give a staff account. SUPER_ADMIN and legacy ADMIN are never assignable. */
export const ASSIGNABLE_STAFF_ROLES = [
  "LECTURER",
  "JUNIOR_CAPTAIN",
  "MIDDLE_CAPTAIN",
  "SENIOR_CAPTAIN",
  "SUCCESS_MANAGER",
] as const satisfies readonly StaffRole[];
export type AssignableStaffRole = (typeof ASSIGNABLE_STAFF_ROLES)[number];

export type Capability =
  | "staff.manage" // Staff & Access Management
  | "programs.manage" // programs, subjects, groups, cohorts
  | "students.manage" // create / edit / delete students, passwords, schedules
  | "students.view" // scoped student directory + profiles
  | "notes.write" // add notes / follow-ups to students in scope
  | "quizzes.manage"
  | "hoot.host"
  | "leaderboard.view"
  | "inco.view"
  | "bugs.manage"
  | "captains.supervise"
  | "overview.admin"; // the full admin overview dashboard

const MATRIX: Record<StaffRole, readonly Capability[]> = {
  SUPER_ADMIN: [
    "staff.manage",
    "programs.manage",
    "students.manage",
    "students.view",
    "notes.write",
    "quizzes.manage",
    "hoot.host",
    "leaderboard.view",
    "inco.view",
    "bugs.manage",
    "overview.admin",
  ],
  // Legacy program-scoped admin: exactly the access it had before roles
  // existed (no INCO, no staff management, no programs).
  ADMIN: [
    "students.manage",
    "students.view",
    "notes.write",
    "quizzes.manage",
    "hoot.host",
    "leaderboard.view",
    "bugs.manage",
    "overview.admin",
  ],
  LECTURER: ["students.view", "notes.write", "quizzes.manage", "hoot.host"],
  JUNIOR_CAPTAIN: ["students.view", "notes.write", "leaderboard.view"],
  MIDDLE_CAPTAIN: ["students.view", "notes.write", "leaderboard.view", "quizzes.manage", "hoot.host"],
  SENIOR_CAPTAIN: [
    "students.view",
    "notes.write",
    "leaderboard.view",
    "quizzes.manage",
    "hoot.host",
    "captains.supervise",
  ],
  SUCCESS_MANAGER: ["students.view", "notes.write", "leaderboard.view", "inco.view"],
};

export function isStaffRole(role: string): role is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

export function can(user: { role: UserRole } | null | undefined, capability: Capability): boolean {
  if (!user || !isStaffRole(user.role)) return false;
  return MATRIX[user.role].includes(capability);
}

/** Super Admin and legacy Admin - the two roles the original admin area was built for. */
export function isFullAdmin(user: { role: UserRole } | null | undefined): boolean {
  return user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";
}

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin (legacy)",
  STUDENT: "Student",
  LECTURER: "Lecturer",
  JUNIOR_CAPTAIN: "Junior Captain",
  MIDDLE_CAPTAIN: "Middle Captain",
  SENIOR_CAPTAIN: "Senior Captain",
  SUCCESS_MANAGER: "Success Manager",
};

export const ROLE_DESCRIPTIONS: Record<AssignableStaffRole, string> = {
  LECTURER: "Teaches subject groups. Quizzes, HootArena and academic notes for those groups.",
  JUNIOR_CAPTAIN: "Looks after individually assigned students: outreach, follow-ups, feedback.",
  MIDDLE_CAPTAIN: "Runs a cohort: academic support, follow-ups, quizzes and HootArena.",
  SENIOR_CAPTAIN: "Supervises Junior and Middle Captains and their students' progress.",
  SUCCESS_MANAGER: "Owns one program: student progress, feedback, INCO and statistics.",
};

/** Where a freshly logged-in user lands. */
export function workspaceHome(role: UserRole): string {
  return role === "STUDENT" ? "/dashboard" : "/admin";
}
