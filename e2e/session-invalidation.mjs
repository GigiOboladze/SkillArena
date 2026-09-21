// E2E coverage for cross-device session invalidation (User.sessionVersion):
// a student's own password change, and an admin-issued password reset, must
// both sign that student out on every device immediately, not just in the
// browser/flow that changed it. Deliberately does NOT exercise an admin's
// own self-service password change against ADMIN_USERNAME/ADMIN_PASSWORD -
// those are real, reused login credentials (not a throwaway test account),
// and changing them here would leave whoever runs this test locked out of
// their real admin login. The admin-side code path is symmetric with the
// student-side path this test does cover (see session.ts), and is exercised
// once, safely, in the "admin resets a student's password" scenario below.
// Companion to smoke.mjs / skillarena.mjs / admin-bugreports.mjs - run:
//   npm run test:e2e:session
import "dotenv/config";
import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  throw new Error("ADMIN_USERNAME / ADMIN_PASSWORD must be set (via .env) to run this test");
}

const results = [];
function ok(name) { results.push({ name, pass: true }); console.log("PASS:", name); }
function fail(name, err) { results.push({ name, pass: false, err: String(err) }); console.log("FAIL:", name, "-", err); }
async function assert(cond, message) { if (!cond) throw new Error(message); }

const browser = await chromium.launch();
const main = (p) => p.locator("main");
const RUN_ID = Date.now();

async function loginAs(page, user, pass) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="username"]', user);
  await page.fill('input[name="password"]', pass);
  await Promise.all([page.waitForURL(`${BASE}/dashboard`), page.click('button[type="submit"]')]);
}

async function createStudent(admin, username, password) {
  await admin.goto(`${BASE}/admin/students`, { waitUntil: "networkidle" });
  await main(admin).locator('input[name="firstName"]').fill("Sess");
  await main(admin).locator('input[name="lastName"]').fill("Test");
  await main(admin).locator('input[name="username"]').fill(username);
  await main(admin).locator('input[name="password"]').fill(password);
  await Promise.all([
    admin.waitForURL((u) => u.searchParams.get("created") === username.toLowerCase()),
    main(admin).getByRole("button", { name: "Create student" }).click(),
  ]);
}

async function run() {
  const admin = await browser.newPage();
  await admin.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
  await admin.fill('input[name="username"]', ADMIN_USERNAME);
  await admin.fill('input[name="password"]', ADMIN_PASSWORD);
  await Promise.all([admin.waitForURL(`${BASE}/admin`), admin.click('button[type="submit"]')]);
  ok("admin login");

  // ---------- Scenario 1: student changes their own password (My Profile) ----------
  const username1 = `e2e-sess-self-${RUN_ID}`;
  const oldPassword = "pass-123456";
  const newPassword = "new-pass-654321";
  await createStudent(admin, username1, oldPassword);
  ok("created test student (self-service scenario)");

  const deviceA = await browser.newContext();
  const deviceB = await browser.newContext();
  const pageA = await deviceA.newPage();
  const pageB = await deviceB.newPage();

  await loginAs(pageA, username1, oldPassword);
  await loginAs(pageB, username1, oldPassword);
  ok("logged in on two independent devices with the same account");

  await pageB.goto(`${BASE}/dashboard/profile`, { waitUntil: "networkidle" });
  const pwFields = main(pageB).locator('input[type="password"]');
  await pwFields.nth(0).fill(newPassword);
  await pwFields.nth(1).fill(newPassword);
  await Promise.all([
    pageB.waitForURL((u) => u.pathname === "/login" && u.searchParams.get("passwordChanged") === "1"),
    main(pageB).getByRole("button", { name: "Change password" }).click(),
  ]);
  ok("device B changed its own password and was redirected to login");

  await pageA.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await assert(pageA.url().startsWith(`${BASE}/login`), `device A must be forced back to /login after the password change on device B, got: ${pageA.url()}`);
  ok("device A's old session is rejected immediately after the password change on device B (cross-device invalidation works)");

  const badLogin1 = await browser.newPage();
  await badLogin1.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await badLogin1.fill('input[name="username"]', username1);
  await badLogin1.fill('input[name="password"]', oldPassword);
  await badLogin1.click('button[type="submit"]');
  await badLogin1.waitForURL(/error=invalid/);
  await badLogin1.close();
  ok("old password no longer works");

  await loginAs(pageA, username1, newPassword);
  ok("new password works, device A can log back in with it");
  await deviceA.close();
  await deviceB.close();

  // ---------- Scenario 2: admin resets a student's password ----------
  const username2 = `e2e-sess-admin-${RUN_ID}`;
  await createStudent(admin, username2, oldPassword);
  const deviceC = await browser.newContext();
  const pageC = await deviceC.newPage();
  await loginAs(pageC, username2, oldPassword);
  ok("scenario 2: student logged in before an admin-issued reset");

  await admin.goto(`${BASE}/admin/students`, { waitUntil: "networkidle" });
  // Several test students share the same display name ("Sess Test") - find
  // the row by its unique @username text, then click the name link inside it.
  const studentRow = main(admin).locator("li", { hasText: `@${username2}` });
  await Promise.all([
    admin.waitForURL(/\/admin\/students\/[a-z0-9]+$/),
    studentRow.locator("a").first().click(),
  ]);
  const setPwFields = main(admin).locator('input[type="password"]');
  await setPwFields.nth(0).fill("admin-reset-pass-999");
  await setPwFields.nth(1).fill("admin-reset-pass-999");
  admin.once("dialog", (d) => d.accept());
  await Promise.all([
    admin.waitForURL((u) => u.searchParams.has("password")),
    main(admin).getByRole("button", { name: "Set new password" }).click(),
  ]);
  ok("admin set a new password for the student from the student detail page");

  await pageC.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await assert(pageC.url().startsWith(`${BASE}/login`), `student's existing session must be rejected immediately after an admin-issued password reset, got: ${pageC.url()}`);
  ok("admin-issued password reset also signs the student out immediately (not just self-service changes)");
  await deviceC.close();

  await admin.close();
  await browser.close();
}

run()
  .then(() => {
    const failed = results.filter((r) => !r.pass);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) process.exitCode = 1;
  })
  .catch((err) => {
    fail("session check crashed", err.message || err);
    console.log(`\n${results.filter((r) => r.pass).length}/${results.length} checks passed`);
    process.exitCode = 1;
  });
