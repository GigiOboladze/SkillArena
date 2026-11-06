"use server";

import { redirect } from "next/navigation";
import { verifyAdminCredentials, createAdminSession } from "@/lib/session";
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

export async function login(formData: FormData) {
  const username = String(formData.get("username") || "");
  const password = String(formData.get("password") || "");
  const from = String(formData.get("from") || "/admin");

  function fail(error: "invalid" | "throttled"): never {
    const url = new URL("/admin/login", "http://internal");
    url.searchParams.set("error", error);
    if (from && from !== "/admin") url.searchParams.set("from", from);
    redirect(url.pathname + url.search);
  }

  // Throttled BEFORE touching the database or running scrypt - the point is to
  // not spend CPU on an attempt we have already decided to reject. See
  // rate-limit.ts for why there are two independent limits.
  const browserKey = await getAuthRateLimitKey();
  if (!checkRateLimit(`login:admin:browser:${browserKey}`, LOGIN_MAX_ATTEMPTS_PER_BROWSER, LOGIN_BROWSER_WINDOW_MS)) {
    fail("throttled");
  }

  const usernameKey = loginAttemptKeyForUsername("admin", username);
  if (!checkRateLimit(usernameKey, LOGIN_MAX_FAILURES_PER_USERNAME, LOGIN_FAILURE_WINDOW_MS)) {
    fail("throttled");
  }

  const admin = await verifyAdminCredentials(username, password);
  if (!admin) {
    fail("invalid");
  }

  // A successful login forgets this account's recorded attempts, so an admin
  // who mistyped a few times is never left throttled.
  clearRateLimit(usernameKey);

  await createAdminSession(admin.id, admin.username, admin.sessionVersion);
  redirect(from.startsWith("/admin") ? from : "/admin");
}
