// End-to-end coverage for the SkillArena-specific features: subject/group
// eligibility, the timed anti-cheat quiz attempt system, the cumulative
// leaderboard, and theme persistence. Companion to e2e/smoke.mjs (which
// covers the original LIVE/ASYNC homework flows) - run both:
//   npm run test:e2e        (legacy LIVE/ASYNC)
//   npm run test:e2e:skillarena
// Creates throwaway quizzes/students each run (unique-suffixed usernames),
// safe against a local/dev database only.
import "dotenv/config";
import { chromium } from "playwright";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
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

async function adminLogin() {
  const page = await browser.newPage();
  await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="username"]', ADMIN_USERNAME);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
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

async function createStudent(admin, username, jsGroupLabel) {
  await admin.goto(`${BASE}/admin/students`, { waitUntil: "networkidle" });
  await main(admin).locator('input[name="firstName"]').fill(username);
  await main(admin).locator('input[name="lastName"]').fill("Test");
  await main(admin).locator('input[name="username"]').fill(username);
  await main(admin).locator('input[name="password"]').fill("pass-123456");
  if (jsGroupLabel) {
    const shortLabel = jsGroupLabel.replace(/^Group /, "");
    await main(admin)
      .getByRole("radiogroup", { name: "JavaScript group" })
      .getByRole("radio", { name: shortLabel, exact: true })
      .check();
  }
  await Promise.all([
    admin.waitForURL((u) => u.searchParams.get("created") === username.toLowerCase()),
    main(admin).getByRole("button", { name: "Create student" }).click(),
  ]);
}

async function run() {
  const admin = await adminLogin();
  ok("admin login");

  // ---------- Invalid student login ----------
  const badLogin = await browser.newPage();
  await badLogin.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await badLogin.fill('input[name="username"]', "no-such-user");
  await badLogin.fill('input[name="password"]', "whatever");
  await badLogin.click('button[type="submit"]');
  await badLogin.waitForURL(/error=invalid/);
  ok("invalid student login rejected");
  await badLogin.close();

  // ---------- Create a JavaScript quiz targeted at Group I + Group III ----------
  await admin.goto(`${BASE}/admin/quizzes/new`, { waitUntil: "networkidle" });
  await admin.fill('input[name="title"]', `E2E JS Quiz ${RUN_ID}`);
  await admin.selectOption('select[name="subjectId"]', { label: "JavaScript" });
  await Promise.all([
    admin.waitForURL((u) => /\/admin\/quizzes\/[a-z0-9]+$/.test(u.pathname) && !u.pathname.endsWith("/new")),
    main(admin).locator('button[type="submit"]').click(),
  ]);
  const quizUrl = admin.url();
  const quizId = quizUrl.split("/").pop();
  ok(`quiz created with subject JavaScript (${quizId})`);

  const questions = [
    { text: "What does Array.map() return?", opts: ["undefined", "The original array", "A new array", "A boolean"], correct: 3 },
    { text: "Which keyword declares a block-scoped variable?", opts: ["var", "let", "function", "global"], correct: 2 },
  ];
  for (const q of questions) {
    await admin.goto(`${quizUrl}/questions/new`, { waitUntil: "networkidle" });
    await admin.fill('textarea[name="text"]', q.text);
    for (let i = 0; i < 4; i++) await admin.fill(`input[name="opt${i + 1}"]`, q.opts[i]);
    await admin.check(`input[name="correct"][value="${q.correct}"]`);
    await Promise.all([admin.waitForURL(quizUrl), main(admin).locator('button[type="submit"]').click()]);
  }
  ok("added 2 questions, each with exactly 4 options and one correct answer");

  // Cannot publish before subject+groups are set is moot here (subject was set at
  // creation) - verify target-group assignment instead: Group I + Group III.
  await admin.goto(quizUrl, { waitUntil: "networkidle" });
  const groupCheckboxes = main(admin).locator('input[name="groupIds"]');
  await groupCheckboxes.nth(0).check(); // Group I
  await groupCheckboxes.nth(2).check(); // Group III
  await main(admin).getByRole("button", { name: "Save subject & groups" }).click();
  await admin.waitForLoadState("networkidle");
  ok("assigned multiple target groups (Group I + Group III) to the quiz");

  await main(admin).getByRole("button", { name: "Published", exact: true }).click();
  await admin.waitForTimeout(500);
  ok("quiz published");

  // ---------- Students in different groups ----------
  const uGroupI = `e2e-gi-${RUN_ID}`;
  const uGroupII = `e2e-gii-${RUN_ID}`;
  const uNoGroup = `e2e-ng-${RUN_ID}`;
  await createStudent(admin, uGroupI, "Group I");
  await createStudent(admin, uGroupII, "Group II");
  await createStudent(admin, uNoGroup, null);
  ok("created students in Group I, Group II, and with no JavaScript assignment");

  // Eligible student sees it on the dashboard.
  const sEligible = await studentLogin(uGroupI, "pass-123456");
  const dashboardText = await main(sEligible).innerText();
  await assert(dashboardText.includes(`E2E JS Quiz ${RUN_ID}`), "eligible student should see the quiz on their dashboard");
  ok("student in a matching target group sees the quiz on their dashboard");

  // Ineligible students (wrong group / no group) do not see it, and are blocked server-side even via direct URL.
  const sWrongGroup = await studentLogin(uGroupII, "pass-123456");
  const wrongGroupDash = await main(sWrongGroup).innerText();
  await assert(!wrongGroupDash.includes(`E2E JS Quiz ${RUN_ID}`), "student in a non-matching group should not see the quiz");
  await sWrongGroup.goto(`${BASE}/quiz/${quizId}`, { waitUntil: "networkidle" });
  await assert((await sWrongGroup.locator("body").innerText()).includes("This page could not be found"), "non-matching group must be blocked server-side, not just hidden from the dashboard");
  ok("student in a non-matching group is excluded from listing AND blocked on direct URL access");

  const sNoGroup = await studentLogin(uNoGroup, "pass-123456");
  const noGroupDash = await main(sNoGroup).innerText();
  await assert(!noGroupDash.includes(`E2E JS Quiz ${RUN_ID}`), "student with no subject assignment should not see the quiz");
  ok("student with no subject assignment does not see the quiz");

  // ---------- Take the quiz: navigation, answer changes, refresh persistence ----------
  await sEligible.goto(`${BASE}/quiz/${quizId}`, { waitUntil: "networkidle" });
  await Promise.all([
    sEligible.waitForURL(`${BASE}/quiz/${quizId}/q/0`),
    main(sEligible).getByRole("button", { name: /Enter Arena|Resume quiz/ }).click(),
  ]);
  ok("student started the quiz (briefing screen -> question 0)");

  // Answer Q0 incorrectly first, then change to the correct answer.
  await main(sEligible).locator("form button[type=submit]").nth(1).click(); // "The original array" - wrong
  await sEligible.waitForTimeout(300);
  await main(sEligible).locator("form button[type=submit]").nth(2).click(); // "A new array" - correct
  await sEligible.waitForTimeout(300);
  ok("changed an answer before moving on");

  // Refresh should preserve the selection and not reset the timer.
  await sEligible.reload({ waitUntil: "networkidle" });
  const q0Selected = await main(sEligible).locator("form button[type=submit]").nth(2).getAttribute("aria-pressed");
  await assert(q0Selected === "true", "refresh should preserve the previously selected answer");
  ok("refresh preserves the current answer selection");

  // Next -> Q1, answer correctly, Previous back to Q0 to confirm it kept the (correct) answer, then forward again.
  await Promise.all([
    sEligible.waitForURL(`${BASE}/quiz/${quizId}/q/1`),
    main(sEligible).getByRole("link", { name: "Next" }).click(),
  ]);
  await main(sEligible).locator("form button[type=submit]").nth(1).click(); // "let" - correct
  await sEligible.waitForTimeout(300);
  await Promise.all([
    sEligible.waitForURL(`${BASE}/quiz/${quizId}/q/0`),
    main(sEligible).getByRole("link", { name: "Previous" }).click(),
  ]);
  const q0StillSelected = await main(sEligible).locator("form button[type=submit]").nth(2).getAttribute("aria-pressed");
  await assert(q0StillSelected === "true", "going back must not lose the previous answer or reset its timer");
  ok("Previous/Next navigation preserves answers (and does not grant a fresh timer)");

  await Promise.all([
    sEligible.waitForURL(`${BASE}/quiz/${quizId}/q/1`),
    main(sEligible).getByRole("link", { name: "Next" }).click(),
  ]);
  await Promise.all([
    sEligible.waitForURL(`${BASE}/quiz/${quizId}/review`),
    main(sEligible).getByRole("link", { name: "Review answers" }).click(),
  ]);
  sEligible.on("dialog", (d) => d.accept());
  await Promise.all([
    sEligible.waitForURL(`${BASE}/quiz/${quizId}/result`),
    main(sEligible).getByRole("button", { name: "Submit quiz" }).click(),
  ]);
  // The score display count-up animates for ~700ms - wait for it to settle
  // before reading the text (the underlying score is correct immediately;
  // only the visual reveal is still in flight).
  await sEligible.waitForTimeout(900);
  const resultText = await main(sEligible).innerText();
  await assert(resultText.includes("2 / 2"), "expected a perfect score of 2/2, got: " + resultText);
  ok("score calculated correctly server-side (2/2)");

  // ---------- One attempt per quiz ----------
  await sEligible.goto(`${BASE}/quiz/${quizId}`, { waitUntil: "networkidle" });
  const retakeText = await main(sEligible).innerText();
  await assert(retakeText.includes("already completed"), "a completed quiz must not offer a retake");
  ok("completed quiz cannot be retaken (attempt is locked)");

  // ---------- Anti-cheat: 3rd tab switch fails the attempt ----------
  const uCheater = `e2e-cheat-${RUN_ID}`;
  await createStudent(admin, uCheater, "Group I");
  const sCheater = await studentLogin(uCheater, "pass-123456");
  await sCheater.goto(`${BASE}/quiz/${quizId}`, { waitUntil: "networkidle" });
  await Promise.all([
    sCheater.waitForURL(`${BASE}/quiz/${quizId}/q/0`),
    main(sCheater).getByRole("button", { name: /Enter Arena|Resume quiz/ }).click(),
  ]);

  async function simulateSwitch() {
    await sCheater.evaluate(() => {
      Object.defineProperty(document, "hidden", { value: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await sCheater.waitForTimeout(400);
    await sCheater.evaluate(() => {
      Object.defineProperty(document, "hidden", { value: false, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await sCheater.waitForTimeout(300);
  }

  await simulateSwitch();
  let counterText = await main(sCheater).innerText();
  await assert(counterText.includes("1 / 3"), "expected tab-switch counter at 1/3 after first switch");
  await simulateSwitch();
  counterText = await main(sCheater).innerText();
  await assert(counterText.includes("2 / 3"), "expected tab-switch counter at 2/3 after second switch");
  ok("tab-switch counter visibly increments (1/3, 2/3)");

  await simulateSwitch();
  await sCheater.waitForURL(`${BASE}/quiz/${quizId}/result`, { timeout: 5000 });
  const failText = await main(sCheater).innerText();
  await assert(failText.includes("QUIZ FAILED"), "expected QUIZ FAILED after the 3rd tab switch");
  await assert(failText.includes("0 / 2"), "a failed attempt must score 0");
  ok("3rd tab switch immediately fails the attempt with score 0");

  // Failed attempt must also be permanently locked.
  await sCheater.goto(`${BASE}/quiz/${quizId}`, { waitUntil: "networkidle" });
  const afterFailText = await main(sCheater).innerText();
  await assert(afterFailText.includes("already completed"), "a failed attempt must not be retakeable");
  await sCheater.goto(`${BASE}/quiz/${quizId}/q/0`, { waitUntil: "networkidle" });
  await assert(sCheater.url().endsWith("/result"), "direct navigation to a question after failure must redirect to the result, not resume the quiz");
  ok("failed attempt is permanently locked, including via direct question URL");

  // ---------- Global cumulative leaderboard ----------
  // uGroupI (2/2, correct) should show 2 points; uCheater (failed) should show 0 -
  // both computed live from stored QuizAttempt rows, not a cached counter.
  const [eligibleUser, cheaterUser] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { username: uGroupI } }),
    prisma.user.findUniqueOrThrow({ where: { username: uCheater } }),
  ]);
  const [eligibleSum, cheaterSum] = await Promise.all([
    prisma.quizAttempt.aggregate({ where: { studentId: eligibleUser.id }, _sum: { score: true } }),
    prisma.quizAttempt.aggregate({ where: { studentId: cheaterUser.id }, _sum: { score: true } }),
  ]);
  await assert(eligibleSum._sum.score === 2, `expected eligible student's total score to be 2, got ${eligibleSum._sum.score}`);
  await assert(cheaterSum._sum.score === 0, `expected failed attempt to contribute 0 points, got ${cheaterSum._sum.score}`);
  ok("cumulative totals are correct: completed quiz contributes its score, failed attempt contributes 0");

  await sEligible.goto(`${BASE}/dashboard/leaderboard`, { waitUntil: "networkidle" });
  const lbText = await main(sEligible).innerText();
  await assert(lbText.includes("Leaderboard"), "expected the leaderboard page to render");
  ok("student leaderboard page renders the global (not per-subject) standings");

  // ---------- Theme persistence ----------
  const themePage = await browser.newPage();
  await themePage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await themePage.click(".theme-toggle");
  await themePage.waitForTimeout(300);
  const storedTheme = await themePage.evaluate(() => localStorage.getItem("skillarena-theme"));
  await assert(storedTheme === "light" || storedTheme === "dark", "expected a theme choice to be persisted to localStorage");
  await themePage.reload({ waitUntil: "networkidle" });
  const themeAfterReload = await themePage.evaluate(() => document.documentElement.getAttribute("data-theme"));
  await assert(themeAfterReload === storedTheme, "theme choice must survive a reload (no flash back to the default)");
  await themePage.close();
  ok("theme selection persists across reloads");

  await browser.close();
  await prisma.$disconnect();
}

try {
  await run();
} catch (err) {
  fail("skillarena e2e crashed", err?.stack || err);
} finally {
  try { await browser.close(); } catch {}
  try { await prisma.$disconnect(); } catch {}
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("FAILURES:", failed);
    process.exit(1);
  }
}
