"use server";

import { redirect } from "next/navigation";
import { verifyLoginCredentials } from "@/lib/session";
import { newAdminEntry, newStudentUserEntry } from "@/lib/session-core";
import { readSessionEnvelope, writeSessionEnvelope } from "@/lib/session-envelope";
import { isStaffRole, workspaceHome } from "@/lib/authz";
import {
  checkRateLimit,
  clearRateLimit,
  getAuthRateLimitKey,
  loginAttemptKeyForUsername,
  LOGIN_MAX_FAILURES_PER_USERNAME,
  LOGIN_FAILURE_WINDOW_MS,
  LOGIN_MAX_ATTEMPTS_PER_BROWSER,
  LOGIN_BROWSER_WINDOW_MS,
} from "@/lib/rate-limit";

/** Only same-site paths inside the user's own workspace are honoured as a post-login destination. */
function safeDestination(from: string, role: string): string {
  const home = workspaceHome(role as never);
  if (!from.startsWith("/") || from.startsWith("//")) return home;
  if (role === "STUDENT") return from.startsWith("/dashboard") || from.startsWith("/quiz") ? from : home;
  return from.startsWith("/admin") && !from.startsWith("/admin/login") ? from : home;
}

/**
 * The one login for every SkillArena account - students and all staff roles.
 * There is no role selector: the account's role comes from the database
 * after the password is verified, and decides both which session entry is
 * issued and which workspace the user lands in.
 */
export async function login(formData: FormData) {
  const username = String(formData.get("username") || "");
  const password = String(formData.get("password") || "");
  const from = String(formData.get("from") || "");

  function fail(error: "invalid" | "throttled"): never {
    const url = new URL("/login", "http://internal");
    url.searchParams.set("error", error);
    if (from) url.searchParams.set("from", from);
    redirect(url.pathname + url.search);
  }

  // Throttled BEFORE touching the database or running scrypt. See
  // rate-limit.ts for why there are two independent limits.
  const browserKey = await getAuthRateLimitKey();
  if (!checkRateLimit(`login:browser:${browserKey}`, LOGIN_MAX_ATTEMPTS_PER_BROWSER, LOGIN_BROWSER_WINDOW_MS)) {
    fail("throttled");
  }
  const usernameKey = loginAttemptKeyForUsername("account", username);
  if (!checkRateLimit(usernameKey, LOGIN_MAX_FAILURES_PER_USERNAME, LOGIN_FAILURE_WINDOW_MS)) {
    fail("throttled");
  }

  const user = await verifyLoginCredentials(username, password);
  if (!user) fail("invalid");
  clearRateLimit(usernameKey);

  // One account per browser at a time: signing in as anyone replaces both
  // the staff and the student entry, so a shared classroom computer never
  // carries a previous person's session alongside the new one.
  const envelope = await readSessionEnvelope();
  delete envelope.admin;
  delete envelope.studentUser;
  if (user.role === "STUDENT") {
    envelope.studentUser = newStudentUserEntry(user.id, user.username, user.sessionVersion);
  } else if (isStaffRole(user.role)) {
    envelope.admin = newAdminEntry(user.id, user.username, user.sessionVersion);
  } else {
    fail("invalid");
  }
  await writeSessionEnvelope(envelope);

  redirect(safeDestination(from, user.role));
}
