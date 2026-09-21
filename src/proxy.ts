import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  adminSessionCookieName,
  verifyAdminToken,
  verifySessionEnvelope,
  studentUserFromEnvelope,
} from "@/lib/session-core";

// Guards the SkillArena authenticated areas. This is the wall that keeps
// /admin unreachable for anyone but a logged-in admin User, and /dashboard +
// /quiz unreachable for anyone but a logged-in student User - every request
// under either tree (other than the login pages themselves) must carry a
// valid, signed session cookie for the matching role or it gets bounced to
// the right login page before any page/data ever renders. Legacy LIVE/ASYNC
// routes (/join, /play, /homeworks, /my-homeworks) are untouched and stay
// open exactly as before - they don't use accounts at all.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin/login" || pathname === "/login") {
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    const token = request.cookies.get(adminSessionCookieName())?.value;
    const session = token ? await verifyAdminToken(token) : null;
    if (!session) {
      const loginUrl = new URL("/admin/login", request.nextUrl);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // /dashboard and /quiz require a logged-in SkillArena student account.
  const token = request.cookies.get(adminSessionCookieName())?.value; // same shared "__session" cookie
  const envelope = token ? await verifySessionEnvelope(token) : {};
  const student = studentUserFromEnvelope(envelope);
  if (!student) {
    const loginUrl = new URL("/login", request.nextUrl);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*", "/quiz/:path*"],
};
