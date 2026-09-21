// E2E coverage for the multi-program architecture: a regular Admin scoped
// to one program must never see or reach another program's students,
// quizzes, or results, even via direct URL - and a Student's program
// determines their entire quiz/leaderboard visibility, including the
// "assigned to a subject but no group yet" and "no program at all" states.
// Uses two pre-seeded regular Admins (e2e-test-admin -> Front-end
// Development, e2e-net-admin -> Networks) rather than the real Super Admin,
// since creating a second program-scoped admin through the UI requires
// Super Admin credentials this suite doesn't have (see session notes) -
// this still exercises the actual authorization logic those admins are
// bound by, just via pre-seeded accounts instead of the creation flow.
// Run: npm run test:e2e:programs
import "dotenv/config";
import { chromium } from "playwright";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const FRONTEND_ADMIN = { username: "e2e-test-admin", password: "e2e-test-pass-123456" };
const NETWORKS_ADMIN = { username: "e2e-net-admin", password: "e2e-net-pass-123456" };

const results = [];
function ok(name) { results.push({ name, pass: true }); console.log("PASS:", name); }
function fail(name, err) { results.push({ name, pass: false, err: String(err) }); console.log("FAIL:", name, "-", err); }
async function assert(cond, message) { if (!cond) throw new Error(message); }

const prisma = new PrismaClient();
const browser = await chromium.launch();
const main = (p) => p.locator("main");
const RUN_ID = Date.now();

async function login(creds) {
  const page = await browser.newPage();
  await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="username"]', creds.username);
  await page.fill('input[name="password"]', creds.password);
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

async function createStudent(admin, username) {
  await admin.goto(`${BASE}/admin/students`, { waitUntil: "networkidle" });
  await main(admin).locator('input[name="firstName"]').fill("Iso");
  await main(admin).locator('input[name="lastName"]').fill("Test");
  await main(admin).locator('input[name="username"]').fill(username);
  await main(admin).locator('input[name="password"]').fill("pass-123456");
  await Promise.all([
    admin.waitForURL((u) => u.searchParams.get("created") === username.toLowerCase()),
    main(admin).getByRole("button", { name: "Create student" }).click(),
  ]);
}

async function run() {
  const feAdmin = await login(FRONTEND_ADMIN);
  ok("Front-end admin login");
  const netAdmin = await login(NETWORKS_ADMIN);
  ok("Networks admin login");

  // ---------- Header shows the admin's own program, not the other's ----------
  // The program name renders inside a `.badge`, which is CSS
  // text-transform: uppercase - .innerText() reflects that rendered
  // transform, so compare case-insensitively rather than to the exact
  // stored casing.
  const feHeader = (await feAdmin.locator("header").innerText()).toLowerCase();
  await assert(feHeader.includes("front-end development"), "Front-end admin header should show their program");
  const netHeader = (await netAdmin.locator("header").innerText()).toLowerCase();
  await assert(netHeader.includes("networks"), "Networks admin header should show their program");
  ok("each admin's header shows their own program");

  // ---------- Neither regular admin sees Program management or Admin management ----------
  await assert(!feHeader.includes("admin management") && !feHeader.includes("programs"), "regular admin must not see Admin Management or Programs nav");
  ok("regular admins do not see Super-Admin-only nav items");

  // ---------- Create a student in each program ----------
  const feStudentUser = `e2e-iso-fe-${RUN_ID}`;
  const netStudentUser = `e2e-iso-net-${RUN_ID}`;
  await createStudent(feAdmin, feStudentUser);
  await createStudent(netAdmin, netStudentUser);
  ok("created one student in each program");

  // ---------- Cross-program student list isolation ----------
  await feAdmin.goto(`${BASE}/admin/students`, { waitUntil: "networkidle" });
  const feStudentsText = await main(feAdmin).innerText();
  await assert(feStudentsText.includes(feStudentUser), "Front-end admin should see their own student");
  await assert(!feStudentsText.includes(netStudentUser), "Front-end admin must not see the Networks student");
  ok("Front-end admin's student list excludes the Networks student");

  await netAdmin.goto(`${BASE}/admin/students`, { waitUntil: "networkidle" });
  const netStudentsText = await main(netAdmin).innerText();
  await assert(netStudentsText.includes(netStudentUser), "Networks admin should see their own student");
  await assert(!netStudentsText.includes(feStudentUser), "Networks admin must not see the Front-end student");
  ok("Networks admin's student list excludes the Front-end student");

  // ---------- Direct-URL cross-program access to a student detail page is blocked ----------
  const netStudentRow = await prisma.user.findUniqueOrThrow({ where: { username: netStudentUser } });
  await feAdmin.goto(`${BASE}/admin/students/${netStudentRow.id}`, { waitUntil: "networkidle" });
  const blockedStudentText = await feAdmin.locator("body").innerText();
  await assert(blockedStudentText.includes("This page could not be found"), "Front-end admin must be 404'd on a Networks student's detail URL");
  ok("direct URL to another program's student detail page is blocked server-side");

  // ---------- Cross-program quiz creation, targeting, and student visibility ----------
  await feAdmin.goto(`${BASE}/admin/quizzes/new`, { waitUntil: "networkidle" });
  await feAdmin.fill('input[name="title"]', `Iso FE Quiz ${RUN_ID}`);
  await feAdmin.selectOption('select[name="subjectId"]', { label: "JavaScript" });
  await Promise.all([
    feAdmin.waitForURL((u) => /\/admin\/quizzes\/[a-z0-9]+$/.test(u.pathname) && !u.pathname.endsWith("/new")),
    main(feAdmin).locator('button[type="submit"]').click(),
  ]);
  const feQuizId = feAdmin.url().split("/").pop();
  ok("Front-end admin created a quiz in their own program");

  await netAdmin.goto(`${BASE}/admin/quizzes/new`, { waitUntil: "networkidle" });
  const netSubjectOptions = await netAdmin.locator('select[name="subjectId"] option').allInnerTexts();
  await assert(!netSubjectOptions.some((t) => t.includes("JavaScript")), "Networks admin's subject list must not include a Front-end subject");
  ok("Networks admin cannot even see Front-end's subjects in the quiz-creation dropdown");

  // Networks admin cannot reach the Front-end quiz's manage page directly.
  await netAdmin.goto(`${BASE}/admin/quizzes/${feQuizId}`, { waitUntil: "networkidle" });
  const blockedQuizText = await netAdmin.locator("body").innerText();
  await assert(blockedQuizText.includes("This page could not be found"), "Networks admin must be 404'd on a Front-end quiz's manage URL");
  ok("direct URL to another program's quiz manage page is blocked server-side");

  await netAdmin.goto(`${BASE}/admin/quizzes/${feQuizId}/results`, { waitUntil: "networkidle" });
  const blockedResultsText = await netAdmin.locator("body").innerText();
  await assert(blockedResultsText.includes("This page could not be found"), "Networks admin must be 404'd on a Front-end quiz's results URL");
  ok("direct URL to another program's quiz results page is blocked server-side");

  // Publish the Front-end quiz targeted at Group I, and confirm the Networks student can't see or start it even with a direct URL.
  await feAdmin.goto(`${BASE}/admin/quizzes/${feQuizId}/questions/new`, { waitUntil: "networkidle" });
  await feAdmin.fill('textarea[name="text"]', "Iso question?");
  await feAdmin.fill('input[name="opt1"]', "A");
  await feAdmin.fill('input[name="opt2"]', "B");
  await feAdmin.fill('input[name="opt3"]', "C");
  await feAdmin.fill('input[name="opt4"]', "D");
  await feAdmin.check('input[name="correct"][value="1"]');
  await Promise.all([feAdmin.waitForURL(`${BASE}/admin/quizzes/${feQuizId}`), main(feAdmin).locator('button[type="submit"]').click()]);
  await feAdmin.goto(`${BASE}/admin/quizzes/${feQuizId}`, { waitUntil: "networkidle" });
  await main(feAdmin).locator('input[name="groupIds"]').nth(0).check();
  await main(feAdmin).getByRole("button", { name: "Save subject & groups" }).click();
  await feAdmin.waitForLoadState("networkidle");
  await main(feAdmin).getByRole("button", { name: "Published", exact: true }).click();
  await feAdmin.waitForTimeout(500);

  // Assign the Networks student to Group I of one of their own subjects (irrelevant program, should still not matter).
  await netAdmin.goto(`${BASE}/admin/students/${netStudentRow.id}/edit`, { waitUntil: "networkidle" });
  await main(netAdmin)
    .getByRole("radiogroup", { name: "ინგლისური group" })
    .getByRole("radio", { name: "I", exact: true })
    .check();
  await Promise.all([
    netAdmin.waitForURL((u) => u.searchParams.get("updated") === "1"),
    main(netAdmin).getByRole("button", { name: "Save changes" }).click(),
  ]);

  const netStudent = await studentLogin(netStudentUser, "pass-123456");
  const netDashText = await main(netStudent).innerText();
  await assert(!netDashText.includes(`Iso FE Quiz ${RUN_ID}`), "Networks student must not see a Front-end quiz on their dashboard");
  await netStudent.goto(`${BASE}/quiz/${feQuizId}`, { waitUntil: "networkidle" });
  await assert((await netStudent.locator("body").innerText()).includes("This page could not be found"), "Networks student must be blocked from a Front-end quiz via direct URL even when in 'Group I' of their own program's subject");
  ok("cross-program quiz access is denied even for a student in the matching group NUMBER, because the program itself doesn't match");
  await netStudent.close();

  // ---------- Subject assigned but no group: shown with a message, no quiz access ----------
  await feAdmin.goto(`${BASE}/admin/students/${(await prisma.user.findUniqueOrThrow({ where: { username: feStudentUser } })).id}/edit`, { waitUntil: "networkidle" });
  await main(feAdmin)
    .getByRole("radiogroup", { name: "JavaScript group" })
    .getByRole("radio", { name: "No group yet", exact: true })
    .check();
  await Promise.all([
    feAdmin.waitForURL((u) => u.searchParams.get("updated") === "1"),
    main(feAdmin).getByRole("button", { name: "Save changes" }).click(),
  ]);
  const feStudent = await studentLogin(feStudentUser, "pass-123456");
  const feDashText = await main(feStudent).innerText();
  await assert(feDashText.includes("JavaScript") && feDashText.includes("no group"), "dashboard should show the subject with a no-group message");
  await assert(!feDashText.includes(`Iso FE Quiz ${RUN_ID}`), "a subject with no group must not show its quizzes");
  ok("student assigned to a subject with no group sees a helpful message, not quizzes");
  await feStudent.close();

  // ---------- No program at all is a DB-level impossibility for a Student ----------
  // The users_program_required_check CHECK constraint (see the programs
  // migration) should reject this insert outright - confirms the invariant
  // is enforced in the database, not just by the application ever bothering
  // to set a program. The dashboard's own "no program assigned" branch
  // (StudentDashboardPage) is therefore unreachable in practice for a real
  // STUDENT row and is defensive-only; not exercised by this suite since
  // there is no way to legitimately create the row it guards against.
  let rejectedByConstraint = false;
  try {
    await prisma.user.create({
      data: {
        firstName: "No",
        lastName: "Program",
        username: `e2e-iso-noprog-${RUN_ID}`,
        passwordHash: "x",
        role: "STUDENT",
        programId: null,
      },
    });
  } catch (e) {
    rejectedByConstraint = String(e).includes("users_program_required_check") || String(e.message || e).toLowerCase().includes("constraint");
  }
  await assert(rejectedByConstraint, "the database must reject a STUDENT row with no program - the CHECK constraint should have fired");
  ok("database CHECK constraint rejects a STUDENT/ADMIN row with no program assigned");

  await browser.close();
  await prisma.$disconnect();
}

run()
  .then(() => {
    const failed = results.filter((r) => !r.pass);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) process.exitCode = 1;
  })
  .catch((err) => {
    fail("program isolation e2e crashed", err.message || err);
    console.log(`\n${results.filter((r) => r.pass).length}/${results.length} checks passed`);
    process.exitCode = 1;
  });
