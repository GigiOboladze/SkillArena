"use server";

import { redirect } from "next/navigation";
import { verifyStudentCredentials, createStudentUserSession } from "@/lib/session";
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
  const from = String(formData.get("from") || "/dashboard");

  function fail(error: "invalid" | "throttled"): never {
    const url = new URL("/login", "http://internal");
    url.searchParams.set("error", error);
    if (from && from !== "/dashboard") url.searchParams.set("from", from);
    redirect(url.pathname + url.search);
  }

  // Throttled BEFORE touching the database or running scrypt - the point is to
  // not spend CPU on an attempt we have already decided to reject. See
  // rate-limit.ts for why there are two independent limits.
  const browserKey = await getAuthRateLimitKey();
  if (!checkRateLimit(`login:student:browser:${browserKey}`, LOGIN_MAX_ATTEMPTS_PER_BROWSER, LOGIN_BROWSER_WINDOW_MS)) {
    fail("throttled");
  }

  const usernameKey = loginAttemptKeyForUsername("student", username);
  if (!checkRateLimit(usernameKey, LOGIN_MAX_FAILURES_PER_USERNAME, LOGIN_FAILURE_WINDOW_MS)) {
    fail("throttled");
  }

  const student = await verifyStudentCredentials(username, password);
  if (!student) {
    fail("invalid");
  }

  // A successful login forgets this account's recorded attempts, so a student
  // who mistyped a few times is never left throttled.
  clearRateLimit(usernameKey);

  await createStudentUserSession(student.id, student.username, student.sessionVersion);
  redirect(from.startsWith("/dashboard") || from.startsWith("/quiz") ? from : "/dashboard");
}
