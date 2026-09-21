// E2E coverage for the corrected, per-program group counts: Front-end
// Development has 4 fixed groups (I-IV), Networks has 3 (I-III) - not a
// global constant. Regression test for the bug where every program was
// incorrectly forced to exactly 3 groups. Run: npm run test:e2e:groupcount
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

async function run() {
  // ---------- Database-level check ----------
  const feProgram = await prisma.program.findUniqueOrThrow({ where: { name: "Front-end Development" } });
  const netProgram = await prisma.program.findUniqueOrThrow({ where: { name: "Networks" } });
  await assert(feProgram.groupCount === 4, `expected Front-end Development groupCount=4, got ${feProgram.groupCount}`);
  await assert(netProgram.groupCount === 3, `expected Networks groupCount=3, got ${netProgram.groupCount}`);
  ok("Program.groupCount is 4 for Front-end Development and 3 for Networks");

  const jsSubject = await prisma.subject.findFirstOrThrow({ where: { programId: feProgram.id, name: "JavaScript" }, include: { groups: true } });
  await assert(jsSubject.groups.length === 4, `expected JavaScript (Front-end) to have 4 groups, got ${jsSubject.groups.length}`);
  await assert(jsSubject.groups.some((g) => g.name === "Group IV"), "expected a real Group IV row on JavaScript");
  ok("Front-end subjects have exactly 4 groups, including a real Group IV");

  const netEnglish = await prisma.subject.findFirstOrThrow({ where: { programId: netProgram.id, name: "ინგლისური" }, include: { groups: true } });
  await assert(netEnglish.groups.length === 3, `expected Networks English to have 3 groups, got ${netEnglish.groups.length}`);
  await assert(!netEnglish.groups.some((g) => g.name === "Group IV"), "Networks subjects must NOT have a Group IV");
  ok("Networks subjects have exactly 3 groups, no Group IV");

  // ---------- UI: Front-end admin's group selector offers 4 options for JavaScript ----------
  const feAdmin = await login(FRONTEND_ADMIN);
  await feAdmin.goto(`${BASE}/admin/students`, { waitUntil: "networkidle" });
  const feRadios = await main(feAdmin).getByRole("radiogroup", { name: "JavaScript group" }).getByRole("radio").all();
  const feLabels = await Promise.all(feRadios.map((r) => r.evaluate((el) => el.nextElementSibling?.textContent)));
  await assert(feLabels.includes("IV"), `expected a 'IV' option in the Front-end JavaScript group selector, got: ${feLabels}`);
  ok("Front-end admin's student-creation form offers a Group IV option for JavaScript");

  // ---------- UI: Networks admin's group selector never offers a 4th option ----------
  const netAdmin = await login(NETWORKS_ADMIN);
  await netAdmin.goto(`${BASE}/admin/students`, { waitUntil: "networkidle" });
  const netRadios = await main(netAdmin).getByRole("radiogroup", { name: "ინგლისური group" }).getByRole("radio").all();
  const netLabels = await Promise.all(netRadios.map((r) => r.evaluate((el) => el.nextElementSibling?.textContent)));
  await assert(!netLabels.includes("IV"), `Networks group selector must never offer 'IV', got: ${netLabels}`);
  await assert(netLabels.filter((l) => l !== "Not assigned" && l !== "No group yet").length === 3, `expected exactly 3 real group options for Networks, got: ${netLabels}`);
  ok("Networks admin's student-creation form offers only 3 group options (no IV)");

  // ---------- End-to-end: Front-end student assigned to Group IV can access a Group-IV-targeted quiz ----------
  const feStudentUser = `e2e-groupiv-stu-${RUN_ID}`;
  await main(feAdmin).locator('input[name="firstName"]').fill("GroupFour");
  await main(feAdmin).locator('input[name="lastName"]').fill("Test");
  await main(feAdmin).locator('input[name="username"]').fill(feStudentUser);
  await main(feAdmin).locator('input[name="password"]').fill("pass-123456");
  await main(feAdmin).getByRole("radiogroup", { name: "JavaScript group" }).getByRole("radio", { name: "IV", exact: true }).check();
  await Promise.all([
    feAdmin.waitForURL((u) => u.searchParams.get("created") === feStudentUser.toLowerCase()),
    main(feAdmin).getByRole("button", { name: "Create student" }).click(),
  ]);
  ok("created a Front-end student assigned to Group IV");

  await feAdmin.goto(`${BASE}/admin/quizzes/new`, { waitUntil: "networkidle" });
  await feAdmin.fill('input[name="title"]', `Group IV Quiz ${RUN_ID}`);
  await feAdmin.selectOption('select[name="subjectId"]', { label: "JavaScript" });
  await Promise.all([
    feAdmin.waitForURL((u) => /\/admin\/quizzes\/[a-z0-9]+$/.test(u.pathname) && !u.pathname.endsWith("/new")),
    main(feAdmin).locator('button[type="submit"]').click(),
  ]);
  const quizId = feAdmin.url().split("/").pop();

  await feAdmin.goto(`${BASE}/admin/quizzes/${quizId}/questions/new`, { waitUntil: "networkidle" });
  await feAdmin.fill('textarea[name="text"]', "Group IV question?");
  await feAdmin.fill('input[name="opt1"]', "A");
  await feAdmin.fill('input[name="opt2"]', "B");
  await feAdmin.fill('input[name="opt3"]', "C");
  await feAdmin.fill('input[name="opt4"]', "D");
  await feAdmin.check('input[name="correct"][value="1"]');
  await Promise.all([feAdmin.waitForURL(`${BASE}/admin/quizzes/${quizId}`), main(feAdmin).locator('button[type="submit"]').click()]);

  await feAdmin.goto(`${BASE}/admin/quizzes/${quizId}`, { waitUntil: "networkidle" });
  // Target ONLY Group IV (the 4th checkbox) - not I, II, or III.
  const groupCheckboxes = main(feAdmin).locator('input[name="groupIds"]');
  await assert(await groupCheckboxes.count() === 4, `expected 4 target-group checkboxes for a Front-end subject, got ${await groupCheckboxes.count()}`);
  await groupCheckboxes.nth(3).check();
  await main(feAdmin).getByRole("button", { name: "Save subject & groups" }).click();
  await feAdmin.waitForTimeout(500);
  await main(feAdmin).getByRole("button", { name: "Published", exact: true }).click();
  await feAdmin.waitForTimeout(800);
  ok("quiz created and published, targeted at Group IV only");

  const feStudent = await studentLogin(feStudentUser, "pass-123456");
  const dashText = await main(feStudent).innerText();
  await assert(dashText.includes(`Group IV Quiz ${RUN_ID}`), "a student in Group IV must see a quiz targeted at Group IV");
  await feStudent.goto(`${BASE}/quiz/${quizId}`, { waitUntil: "networkidle" });
  await Promise.all([
    feStudent.waitForURL(`${BASE}/quiz/${quizId}/q/0`),
    feStudent.getByRole("button", { name: /Enter Arena|Resume quiz/ }).click(),
  ]);
  ok("Front-end student in Group IV can see AND start a quiz targeted at Group IV");
  await feStudent.close();

  // A Group I/II/III Front-end student must NOT see the Group-IV-only quiz.
  const otherStudentUser = `e2e-groupi-stu-${RUN_ID}`;
  await feAdmin.goto(`${BASE}/admin/students`, { waitUntil: "networkidle" });
  await main(feAdmin).locator('input[name="firstName"]').fill("GroupOne");
  await main(feAdmin).locator('input[name="lastName"]').fill("Test");
  await main(feAdmin).locator('input[name="username"]').fill(otherStudentUser);
  await main(feAdmin).locator('input[name="password"]').fill("pass-123456");
  await main(feAdmin).getByRole("radiogroup", { name: "JavaScript group" }).getByRole("radio", { name: "I", exact: true }).check();
  await Promise.all([
    feAdmin.waitForURL((u) => u.searchParams.get("created") === otherStudentUser.toLowerCase()),
    main(feAdmin).getByRole("button", { name: "Create student" }).click(),
  ]);
  const otherStudent = await studentLogin(otherStudentUser, "pass-123456");
  const otherDashText = await main(otherStudent).innerText();
  await assert(!otherDashText.includes(`Group IV Quiz ${RUN_ID}`), "a Group I student must not see a quiz targeted only at Group IV");
  await otherStudent.goto(`${BASE}/quiz/${quizId}`, { waitUntil: "networkidle" });
  await assert((await otherStudent.locator("body").innerText()).includes("This page could not be found"), "a Group I student must be blocked server-side from a Group-IV-only quiz via direct URL");
  ok("Group I student (same subject, wrong group) is excluded from the Group-IV-only quiz, including direct URL");
  await otherStudent.close();

  // ---------- Server-side rejection: manipulated groupId that doesn't belong to the subject ----------
  // Simulate a manipulated request: submit a group_<subjectId> value that
  // looks like a group id but does not belong to that subject (e.g. a real
  // group id borrowed from a DIFFERENT subject/program). The server must
  // silently ignore it (fall through to "not assigned"), not accept it.
  const bogusGroupId = netEnglish.groups[0].id; // a real group id, but for a Networks subject, not JavaScript
  const csrfProbeUser = `e2e-bogus-group-${RUN_ID}`;
  const feAdminCookies = await feAdmin.context().cookies();
  const sessionCookie = feAdminCookies.find((c) => c.name === "__session");
  const formBody = new URLSearchParams({
    firstName: "Bogus",
    lastName: "Group",
    username: csrfProbeUser,
    password: "pass-123456",
    [`group_${jsSubject.id}`]: bogusGroupId,
  });
  // Server Actions require a special encoded POST, which a plain fetch can't
  // forge - so instead verify the same validation path directly: the action
  // only accepts a groupId that appears in THIS subject's own groups list
  // (see parseSubjectGroupAssignments's `subject.groups.some(...)` check).
  // Confirm this in the running app by attempting it through a real (but
  // adversarial) browser DOM manipulation of the form value before submit.
  await feAdmin.goto(`${BASE}/admin/students`, { waitUntil: "networkidle" });
  await main(feAdmin).locator('input[name="firstName"]').fill("Bogus");
  await main(feAdmin).locator('input[name="lastName"]').fill("Group");
  await main(feAdmin).locator('input[name="username"]').fill(csrfProbeUser);
  await main(feAdmin).locator('input[name="password"]').fill("pass-123456");
  // Check the real "No group yet" radio for JavaScript first (so the radio
  // group's native mutual-exclusion is satisfied normally), then mutate
  // that SAME element's value in place to a group id that belongs to a
  // different subject entirely - not offered by the UI, only reachable by
  // tampering with the request exactly like a manipulated direct API call
  // would. No new elements are injected, so there's no duplicate-name
  // interference with the rest of the form.
  await main(feAdmin)
    .getByRole("radiogroup", { name: "JavaScript group" })
    .getByRole("radio", { name: "No group yet", exact: true })
    .check();
  await feAdmin.evaluate(
    ({ subjectId, bogusId }) => {
      const input = document.querySelector(`input[name="group_${subjectId}"][value=""]`);
      if (input) input.value = bogusId;
    },
    { subjectId: jsSubject.id, bogusId: bogusGroupId }
  );
  await main(feAdmin).getByRole("button", { name: "Create student" }).click();
  await feAdmin.waitForLoadState("networkidle");
  await feAdmin.waitForTimeout(500);

  const createdBogusUser = await prisma.user.findUnique({ where: { username: csrfProbeUser }, include: { subjectGroups: true } });
  await assert(!!createdBogusUser, "student creation itself should still succeed (only the bogus group assignment should be rejected)");
  const jsAssignment = createdBogusUser.subjectGroups.find((sg) => sg.subjectId === jsSubject.id);
  await assert(!jsAssignment || jsAssignment.groupId !== bogusGroupId, "a group id that does not belong to the target subject must never be accepted, even via a manipulated request");
  ok("server rejects a manipulated groupId that doesn't belong to the target subject (cross-subject/cross-program group id injection)");

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
    fail("group-count e2e crashed", err.message || err);
    console.log(`\n${results.filter((r) => r.pass).length}/${results.length} checks passed`);
    process.exitCode = 1;
  });
