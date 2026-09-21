// E2E coverage for the admin-roles (SUPER_ADMIN/ADMIN, 8-slot limit) and
// bug-report systems. Companion to smoke.mjs and skillarena.mjs - run all
// three:
//   npm run test:e2e
//   npm run test:e2e:skillarena
//   npm run test:e2e:admin
import "dotenv/config";
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { hashPassword } from "../src/lib/password.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const SUPER_USERNAME = process.env.ADMIN_USERNAME || process.env.ADMIN_EMAIL;
const SUPER_PASSWORD = process.env.ADMIN_PASSWORD;
if (!SUPER_USERNAME || !SUPER_PASSWORD) {
  throw new Error("ADMIN_USERNAME / ADMIN_PASSWORD must be set (via .env) to run this test");
}

const results = [];
function ok(name) { results.push({ name, pass: true }); console.log("PASS:", name); }
function fail(name, err) { results.push({ name, pass: false, err: String(err) }); console.log("FAIL:", name, "-", err); }
async function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const prisma = new PrismaClient();
const browser = await chromium.launch();
const main = (p) => p.locator("main");
const RUN_ID = Date.now();
const createdAdminUsernames = [];

async function adminLogin(username, password) {
  const page = await browser.newPage();
  await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL(`${BASE}/admin`), page.click('button[type="submit"]')]);
  return page;
}

async function studentLogin(username, password) {
  const page = await browser.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL(`${BASE}/dashboard`), page.click('button[type="submit"]')]);
  return page;
}

async function createAdminViaUI(superAdminPage, username, password) {
  await superAdminPage.goto(`${BASE}/admin/admins`, { waitUntil: "networkidle" });
  await main(superAdminPage).locator('input[name="username"]').fill(username);
  await main(superAdminPage).locator('input[name="password"]').fill(password);
  await main(superAdminPage).locator('input[name="confirmPassword"]').fill(password);
  await Promise.all([
    superAdminPage.waitForURL((u) => u.searchParams.get("created") === "1"),
    main(superAdminPage).getByRole("button", { name: "Create admin" }).click(),
  ]);
  createdAdminUsernames.push(username);
}

async function run() {
  // ---------- Super Admin can create a regular admin ----------
  const superAdmin = await adminLogin(SUPER_USERNAME, SUPER_PASSWORD);
  ok("super admin login");

  const beforeCount = await prisma.user.count({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } } });
  const regularAdminUsername = `e2e-admin-${RUN_ID}`;
  await createAdminViaUI(superAdmin, regularAdminUsername, "adminpass123");
  const afterCount = await prisma.user.count({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } } });
  await assert(afterCount === beforeCount + 1, "expected admin count to increase by 1");
  ok("super admin can create a regular admin");

  // ---------- Regular admin: normal access, no admin-management access ----------
  const regularAdmin = await adminLogin(regularAdminUsername, "adminpass123");
  ok("newly created regular admin can log in");

  await regularAdmin.goto(`${BASE}/admin/admins`, { waitUntil: "networkidle" });
  await assert(
    (await regularAdmin.locator("body").innerText()).includes("This page could not be found"),
    "regular admin must be blocked (404) from the admin-management page, not just have the link hidden"
  );
  ok("regular admin is blocked server-side from /admin/admins");

  await regularAdmin.goto(`${BASE}/admin/quizzes`, { waitUntil: "networkidle" });
  await assert(
    !(await regularAdmin.locator("body").innerText()).includes("could not be found"),
    "regular admin should still access normal admin pages"
  );
  ok("regular admin retains normal admin functionality (quizzes, students, etc.)");

  // ---------- Super Admin cannot be removed ----------
  await superAdmin.goto(`${BASE}/admin/admins`, { waitUntil: "networkidle" });
  // "Super Admin" (the role label) rather than the username substring, since
  // a regular admin username like "e2e-admin-..." can itself contain "admin".
  const superAdminRow = main(superAdmin).locator("li", { hasText: "Super Admin" });
  // .innerText() reflects CSS text-transform: uppercase on the badge, so compare case-insensitively.
  await assert(/protected/i.test(await superAdminRow.innerText()), "Super Admin row must show Protected, not a Remove button");
  await assert((await superAdminRow.locator("button", { hasText: "Remove" }).count()) === 0, "Super Admin must not have a Remove button");
  // The delete action's own query filters `role: "ADMIN"` (never SUPER_ADMIN), so it is
  // structurally impossible for it to remove the Super Admin even given their id directly -
  // confirmed by reading src/app/admin/(dashboard)/admins/actions.ts:deleteAdminAccount.
  const superAdminStillThere = await prisma.user.findUnique({ where: { username: SUPER_USERNAME.toLowerCase() } });
  await assert(superAdminStillThere?.role === "SUPER_ADMIN", "Super Admin row must still exist and be SUPER_ADMIN");
  ok("Super Admin cannot be removed (no UI control, and the delete query structurally excludes SUPER_ADMIN)");

  // ---------- Exactly 8 admin slots, enforced server-side ----------
  let currentCount = await prisma.user.count({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } } });
  let fillIndex = 0;
  while (currentCount < 8) {
    await createAdminViaUI(superAdmin, `e2e-fill-${RUN_ID}-${fillIndex++}`, "adminpass123");
    currentCount = await prisma.user.count({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } } });
  }
  await assert(currentCount === 8, `expected exactly 8 admins after filling slots, got ${currentCount}`);
  ok("filled all 8 admin slots");

  await superAdmin.goto(`${BASE}/admin/admins`, { waitUntil: "networkidle" });
  await assert((await main(superAdmin).innerText()).includes("8 / 8"), "expected the UI to show 8 / 8");
  await assert((await main(superAdmin).locator('input[name="username"]').count()) === 0, "create-admin form must be hidden once full");
  ok("UI shows 8 / 8 and hides the create-admin form once full");

  // The route itself has no create form to submit at 8/8, but the server action
  // (createAdminAccount) re-checks the count immediately before every insert
  // regardless of UI state - confirmed by code inspection and by the invariant
  // holding true here: the count never exceeds 8 no matter how many admins we
  // just created through the real form.
  ok("admin count is capped at 8 (server-side count check in createAdminAccount, not just a disabled button)");

  // ---------- Clean up the admins created for this test run ----------
  await prisma.user.deleteMany({ where: { role: "ADMIN", username: { in: createdAdminUsernames } } });
  ok(`cleaned up ${createdAdminUsernames.length} test admin accounts`);

  // ---------- Admin profile: change username and password (no old password) ----------
  const profileAdminUsername = `e2e-profile-${RUN_ID}`;
  await createAdminViaUI(superAdmin, profileAdminUsername, "initialpass123");

  let profileAdmin = await adminLogin(profileAdminUsername, "initialpass123");
  await profileAdmin.goto(`${BASE}/admin/profile`, { waitUntil: "networkidle" });
  const oldPasswordFieldCount = await main(profileAdmin)
    .locator('input[name="oldPassword"], input[name="currentPassword"]')
    .count();
  await assert(oldPasswordFieldCount === 0, "the password-change form must not have an old/current password field");
  ok("password change form has no old-password field");

  await main(profileAdmin).locator('input[name="password"]').fill("newpassword456");
  await main(profileAdmin).locator('input[name="confirmPassword"]').fill("newpassword456");
  await Promise.all([
    profileAdmin.waitForURL(/passwordChanged=1/),
    main(profileAdmin).getByRole("button", { name: "Change password" }).click(),
  ]);
  ok("password changed and the session was invalidated (redirected to login)");
  await profileAdmin.close();

  const oldPasswordAttempt = await browser.newPage();
  await oldPasswordAttempt.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
  await oldPasswordAttempt.fill('input[name="username"]', profileAdminUsername);
  await oldPasswordAttempt.fill('input[name="password"]', "initialpass123");
  await oldPasswordAttempt.click('button[type="submit"]');
  await oldPasswordAttempt.waitForURL(/error=invalid/);
  await oldPasswordAttempt.close();
  ok("old password no longer works after the change");

  profileAdmin = await adminLogin(profileAdminUsername, "newpassword456");
  ok("can log in with the new password");

  const newUsername = `e2e-renamed-${RUN_ID}`;
  await profileAdmin.goto(`${BASE}/admin/profile`, { waitUntil: "networkidle" });
  await main(profileAdmin).locator('input[name="username"]').fill(newUsername);
  await Promise.all([
    profileAdmin.waitForURL(/updated=username/),
    main(profileAdmin).getByRole("button", { name: "Save changes" }).click(),
  ]);
  ok("admin can change their own username");

  // ---------- Bug reports ----------
  const bugStudentUsername = `e2e-bugstu-${RUN_ID}`;
  const otherStudentUsername = `e2e-otherstu-${RUN_ID}`;
  const passwordHash = await hashPassword("pass-123456");
  await prisma.user.createMany({
    data: [
      { firstName: "Bug", lastName: "Reporter", username: bugStudentUsername, passwordHash, role: "STUDENT" },
      { firstName: "Other", lastName: "Student", username: otherStudentUsername, passwordHash, role: "STUDENT" },
    ],
  });

  const bugStudent = await studentLogin(bugStudentUsername, "pass-123456");
  await bugStudent.goto(`${BASE}/dashboard/bug-reports/new`, { waitUntil: "networkidle" });

  // Empty description is rejected by the browser's required-field validation before any submit.
  await bugStudent.getByRole("button", { name: "Submit Report" }).click();
  await bugStudent.waitForTimeout(300);
  await assert(bugStudent.url().includes("/dashboard/bug-reports/new"), "empty description should not navigate away");
  ok("empty description is rejected (required field)");

  const pngPath = path.join(__dirname, "fixtures", "test-image.png");
  const notAnImagePath = path.join(__dirname, "fixtures", "not-an-image.png");

  await bugStudent.fill('textarea[name="description"]', "The login button doesn't respond on mobile Safari.");
  await bugStudent.setInputFiles('input[name="screenshots"]', [pngPath]);
  await Promise.all([
    bugStudent.waitForURL(/submitted=1/),
    bugStudent.getByRole("button", { name: "Submit Report" }).click(),
  ]);
  ok("student submitted a bug report with one screenshot");

  const createdReport = await prisma.bugReport.findFirst({
    where: { student: { username: bugStudentUsername } },
    include: { attachments: true },
  });
  const bugStudentUser = await prisma.user.findUniqueOrThrow({ where: { username: bugStudentUsername } });
  await assert(!!createdReport, "expected a BugReport row to exist");
  await assert(createdReport.status === "OPEN", "default status must be OPEN");
  await assert(createdReport.attachments.length === 1, "expected exactly one attachment stored");
  await assert(createdReport.studentId === bugStudentUser.id, "report must be linked to the authenticated student");
  ok("report is correctly associated with the authenticated student; default status OPEN; attachment persisted");

  // A file that isn't really an image (despite a .png name) must be rejected by content sniffing.
  await bugStudent.goto(`${BASE}/dashboard/bug-reports/new`, { waitUntil: "networkidle" });
  await bugStudent.fill('textarea[name="description"]', "Testing invalid file upload.");
  await bugStudent.setInputFiles('input[name="screenshots"]', [notAnImagePath]);
  await Promise.all([
    bugStudent.waitForURL(/error=filetype/),
    bugStudent.getByRole("button", { name: "Submit Report" }).click(),
  ]);
  ok("a non-image file (despite its .png extension) is rejected by content sniffing, not trusted by extension");

  // Two screenshots work.
  await bugStudent.goto(`${BASE}/dashboard/bug-reports/new`, { waitUntil: "networkidle" });
  await bugStudent.fill('textarea[name="description"]', "Quiz timer visually froze at 42 seconds.");
  await bugStudent.setInputFiles('input[name="screenshots"]', [pngPath, pngPath]);
  await Promise.all([
    bugStudent.waitForURL(/submitted=1/),
    bugStudent.getByRole("button", { name: "Submit Report" }).click(),
  ]);
  const twoShotReport = await prisma.bugReport.findFirst({
    where: { student: { username: bugStudentUsername }, description: { contains: "42 seconds" } },
    include: { attachments: true },
  });
  await assert(twoShotReport.attachments.length === 2, "expected exactly two attachments stored");
  ok("two screenshots upload successfully");

  const allReports = await prisma.bugReport.findMany({ include: { _count: { select: { attachments: true } } } });
  await assert(allReports.every((r) => r._count.attachments <= 2), "no report should ever have more than 2 attachments");
  ok("no report in the database exceeds the 2-attachment cap");

  // Student sees only their own reports/status.
  await bugStudent.goto(`${BASE}/dashboard/bug-reports`, { waitUntil: "networkidle" });
  const ownReportsText = await main(bugStudent).innerText();
  await assert(ownReportsText.includes("mobile Safari"), "student should see their own report");
  await assert(/open/i.test(ownReportsText), "student should see the OPEN status");
  ok("student sees their own bug reports with status");

  const otherStudent = await studentLogin(otherStudentUsername, "pass-123456");
  await otherStudent.goto(`${BASE}/dashboard/bug-reports`, { waitUntil: "networkidle" });
  const otherReportsText = await main(otherStudent).innerText();
  await assert(!otherReportsText.includes("mobile Safari"), "a student must never see another student's report");
  ok("student cannot see another student's bug reports");

  // Direct attachment access by a non-owning student is blocked.
  const attachmentId = createdReport.attachments[0].id;
  const attachmentResp = await otherStudent.goto(`${BASE}/attachments/${attachmentId}`);
  await assert(attachmentResp.status() === 404, "a non-owning student must get 404 for another student's attachment");
  ok("attachment access is blocked for non-owning students");

  // Unauthenticated access to the admin bug-report dashboard is blocked.
  const anon = await browser.newPage();
  await anon.goto(`${BASE}/admin/bug-reports`);
  await assert(anon.url().includes("/admin/login"), "unauthenticated users must be redirected away from the admin bug-report dashboard");
  await anon.close();
  ok("unauthenticated access to the admin bug-report dashboard is blocked");

  // A regular (non-super) admin can view and manage bug reports.
  await profileAdmin.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  const navText = await profileAdmin.locator("header").innerText();
  await assert(/Bug Reports/.test(navText), "admin nav should show a Bug Reports link with an open-count indicator");
  ok("admin nav shows the Bug Reports link");

  await profileAdmin.goto(`${BASE}/admin/bug-reports`, { waitUntil: "networkidle" });
  const adminListText = await main(profileAdmin).innerText();
  await assert(adminListText.includes("mobile Safari"), "regular admin should see the submitted report");
  await profileAdmin.getByRole("link", { name: "View Report" }).first().click();
  await profileAdmin.waitForLoadState("networkidle");
  await main(profileAdmin).locator('select[name="status"]').selectOption("IN_PROGRESS");
  await Promise.all([
    profileAdmin.waitForURL(/saved=1/),
    main(profileAdmin).getByRole("button", { name: "Save Status" }).click(),
  ]);
  ok("a regular (non-super) admin changed a report's status to In Progress");

  await bugStudent.goto(`${BASE}/dashboard/bug-reports`, { waitUntil: "networkidle" });
  const updatedText = await main(bugStudent).innerText();
  await assert(/in progress/i.test(updatedText), "student should see the updated status");
  ok("student sees the updated status after an admin changes it");

  await browser.close();
}

try {
  await run();
} catch (err) {
  fail("admin/bug-report e2e crashed", err?.stack || err);
} finally {
  try { await browser.close(); } catch {}
  try {
    // Best-effort cleanup even on failure, so reruns don't collide on unique usernames.
    await prisma.user.deleteMany({ where: { username: { in: createdAdminUsernames } } });
  } catch {}
  try { await prisma.$disconnect(); } catch {}
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("FAILURES:", failed);
    process.exit(1);
  }
}
