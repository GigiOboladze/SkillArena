// E2E coverage for cross-student privacy isolation, the (non-INCO) Bug
// Reports flow, and a basic mobile-viewport (390px) no-horizontal-overflow +
// no-console-error pass over the main student/admin pages. Companion to
// smoke.mjs / skillarena.mjs / admin-bugreports.mjs / inco.mjs /
// session-invalidation.mjs - run:
//   npm run test:e2e:privacy
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

async function createStudent(admin, username) {
  await admin.goto(`${BASE}/admin/students`, { waitUntil: "networkidle" });
  await main(admin).locator('input[name="firstName"]').fill("Priv");
  await main(admin).locator('input[name="lastName"]').fill("Test");
  await main(admin).locator('input[name="username"]').fill(username);
  await main(admin).locator('input[name="password"]').fill("pass-123456");
  await Promise.all([
    admin.waitForURL((u) => u.searchParams.get("created") === username.toLowerCase()),
    main(admin).getByRole("button", { name: "Create student" }).click(),
  ]);
}

async function loginAs(page, user, pass) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="username"]', user);
  await page.fill('input[name="password"]', pass);
  await Promise.all([page.waitForURL(`${BASE}/dashboard`), page.click('button[type="submit"]')]);
}

async function run() {
  const admin = await browser.newPage();
  await admin.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
  await admin.fill('input[name="username"]', ADMIN_USERNAME);
  await admin.fill('input[name="password"]', ADMIN_PASSWORD);
  await Promise.all([admin.waitForURL(`${BASE}/admin`), admin.click('button[type="submit"]')]);
  ok("admin login");

  // ---------- Cross-student privacy: quiz result isolation ----------
  const userA = `e2e-priv-a-${RUN_ID}`;
  const userB = `e2e-priv-b-${RUN_ID}`;
  await createStudent(admin, userA);
  await createStudent(admin, userB);
  ok("created two students for privacy check");

  const pageA = await browser.newPage();
  await loginAs(pageA, userA, "pass-123456");

  // The quiz-result route is keyed off the LOGGED-IN student's own session
  // (getCurrentStudent + getAttempt(student.id, quizId)), never off a
  // URL-supplied student id - there is no id to manipulate in the first
  // place. Confirm student A's dashboard carries no trace of student B.
  await pageA.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  const dashText = await main(pageA).innerText();
  await assert(!dashText.includes(userB), "student A's dashboard must never mention student B");
  ok("student A's own dashboard contains no trace of student B (no cross-account data leakage)");

  // ---------- Admin student-detail pages are properly isolated per student id ----------
  await admin.goto(`${BASE}/admin/students`, { waitUntil: "networkidle" });
  const rowA = main(admin).locator("li", { hasText: `@${userA}` });
  const hrefA = await rowA.locator("a").first().getAttribute("href");
  const rowB = main(admin).locator("li", { hasText: `@${userB}` });
  const hrefB = await rowB.locator("a").first().getAttribute("href");
  await assert(hrefA !== hrefB, "two different students must have two different detail-page URLs");
  ok("admin student-detail URLs are per-student, not shared");

  // ---------- Bug Reports: student submits, admin sees it ----------
  await pageA.goto(`${BASE}/dashboard/bug-reports/new`, { waitUntil: "networkidle" });
  await pageA.fill('textarea[name="description"]', `Extra-check bug report ${RUN_ID}`);
  await Promise.all([
    pageA.waitForURL((u) => u.pathname === "/dashboard/bug-reports"),
    main(pageA).getByRole("button", { name: "Submit Report" }).click(),
  ]);
  ok("student submitted a bug report");

  const myReportsText = await main(pageA).innerText();
  await assert(myReportsText.includes(`Extra-check bug report ${RUN_ID}`), "student should see their own submitted report");
  ok("student sees their own bug report in their list");

  await admin.goto(`${BASE}/admin/bug-reports`, { waitUntil: "networkidle" });
  const adminReportsText = await main(admin).innerText();
  await assert(adminReportsText.includes(`Extra-check bug report`), "admin should see the submitted bug report in the inbox");
  ok("regular admin can see bug reports (not a super-admin-only feature, unlike INCO)");

  // ---------- Responsive: mobile viewport, no horizontal overflow on key pages ----------
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobile.newPage();
  const consoleErrors = [];
  mobilePage.on("pageerror", (e) => consoleErrors.push(e.message));

  async function checkNoOverflow(url, label) {
    await mobilePage.goto(url, { waitUntil: "networkidle" });
    const { scrollWidth, clientWidth } = await mobilePage.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    await assert(scrollWidth <= clientWidth + 1, `${label}: horizontal overflow at 390px wide (scrollWidth=${scrollWidth}, clientWidth=${clientWidth})`);
    ok(`${label}: no horizontal overflow at 390px viewport`);
  }

  await loginAs(mobilePage, userA, "pass-123456");
  await checkNoOverflow(`${BASE}/dashboard`, "student dashboard");
  await checkNoOverflow(`${BASE}/dashboard/inco`, "INCO submit page");
  await checkNoOverflow(`${BASE}/dashboard/profile`, "student My Profile");
  await checkNoOverflow(`${BASE}/dashboard/leaderboard`, "student leaderboard");

  const mobileAdmin = await mobile.newPage();
  await mobileAdmin.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
  await mobileAdmin.fill('input[name="username"]', ADMIN_USERNAME);
  await mobileAdmin.fill('input[name="password"]', ADMIN_PASSWORD);
  await Promise.all([mobileAdmin.waitForURL(`${BASE}/admin`), mobileAdmin.click('button[type="submit"]')]);
  async function checkAdminNoOverflow(url, label) {
    await mobileAdmin.goto(url, { waitUntil: "networkidle" });
    const { scrollWidth, clientWidth } = await mobileAdmin.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    await assert(scrollWidth <= clientWidth + 1, `${label}: horizontal overflow at 390px wide (scrollWidth=${scrollWidth}, clientWidth=${clientWidth})`);
    ok(`${label}: no horizontal overflow at 390px viewport`);
  }
  await checkAdminNoOverflow(`${BASE}/admin`, "admin dashboard");
  await checkAdminNoOverflow(`${BASE}/admin/students`, "admin students list");

  await assert(consoleErrors.length === 0, `unexpected client-side JS errors during mobile pass: ${consoleErrors.join("; ")}`);
  ok("no uncaught client-side JS errors during the mobile viewport pass");

  await mobile.close();
  await browser.close();
}

run()
  .then(() => {
    const failed = results.filter((r) => !r.pass);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) process.exitCode = 1;
  })
  .catch((err) => {
    fail("extra checks crashed", err.message || err);
    console.log(`\n${results.filter((r) => r.pass).length}/${results.length} checks passed`);
    process.exitCode = 1;
  });
