// E2E coverage for the zero-question quiz guard: a quiz cannot be published
// with no questions, and the last question of an already-published quiz
// cannot be deleted. Root cause this guards against: a student who starts a
// zero-question quiz gets a permanent, unrecoverable stuck attempt (their
// one attempt is created, but the question page immediately bounces them
// back to the start screen forever - see setQuizStatus's comment). Run:
//   npm run test:e2e:quiz-guards
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

async function addQuestion(admin, quizId, text) {
  await admin.goto(`${BASE}/admin/quizzes/${quizId}/questions/new`, { waitUntil: "networkidle" });
  await admin.fill('textarea[name="text"]', text);
  await admin.fill('input[name="opt1"]', "A");
  await admin.fill('input[name="opt2"]', "B");
  await admin.fill('input[name="opt3"]', "C");
  await admin.fill('input[name="opt4"]', "D");
  await admin.check('input[name="correct"][value="1"]');
  await Promise.all([admin.waitForURL(`${BASE}/admin/quizzes/${quizId}`), main(admin).locator('button[type="submit"]').click()]);
}

async function run() {
  const admin = await browser.newPage();
  await admin.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
  await admin.fill('input[name="username"]', ADMIN_USERNAME);
  await admin.fill('input[name="password"]', ADMIN_PASSWORD);
  await Promise.all([admin.waitForURL(`${BASE}/admin`), admin.click('button[type="submit"]')]);
  ok("admin login");

  // ---------- Cannot publish a quiz with zero questions ----------
  await admin.goto(`${BASE}/admin/quizzes/new`, { waitUntil: "networkidle" });
  await admin.fill('input[name="title"]', `Guard Test Quiz ${RUN_ID}`);
  await admin.selectOption('select[name="subjectId"]', { label: "JavaScript" });
  await Promise.all([
    admin.waitForURL((u) => /\/admin\/quizzes\/[a-z0-9]+$/.test(u.pathname) && !u.pathname.endsWith("/new")),
    main(admin).locator('button[type="submit"]').click(),
  ]);
  const quizId = admin.url().split("/").pop();
  ok("created quiz with zero questions");

  await main(admin).locator('input[name="groupIds"]').nth(0).check();
  await main(admin).getByRole("button", { name: "Save subject & groups" }).click();
  await admin.waitForLoadState("networkidle");
  await Promise.all([
    admin.waitForURL((u) => u.searchParams.get("error") === "publish"),
    main(admin).getByRole("button", { name: "Published", exact: true }).click(),
  ]);
  const errorText = await main(admin).innerText();
  await assert(errorText.includes("Add at least one question"), "expected the zero-questions publish error message");
  ok("publishing a zero-question quiz is now blocked server-side with a clear message");

  // Confirm it's still DRAFT, not visible to students.
  const draftStudentUser = `e2e-guard-stu1-${RUN_ID}`;
  await admin.goto(`${BASE}/admin/students`, { waitUntil: "networkidle" });
  await main(admin).locator('input[name="firstName"]').fill("Guard");
  await main(admin).locator('input[name="lastName"]').fill("Test");
  await main(admin).locator('input[name="username"]').fill(draftStudentUser);
  await main(admin).locator('input[name="password"]').fill("pass-123456");
  await main(admin).getByRole("radiogroup", { name: "JavaScript group" }).getByRole("radio", { name: "I", exact: true }).check();
  await Promise.all([
    admin.waitForURL((u) => u.searchParams.get("created") === draftStudentUser.toLowerCase()),
    main(admin).getByRole("button", { name: "Create student" }).click(),
  ]);
  const draftStudent = await browser.newPage();
  await draftStudent.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await draftStudent.fill('input[name="username"]', draftStudentUser);
  await draftStudent.fill('input[name="password"]', "pass-123456");
  await Promise.all([draftStudent.waitForURL(`${BASE}/dashboard`), draftStudent.click('button[type="submit"]')]);
  const dashText = await main(draftStudent).innerText();
  await assert(!dashText.includes(`Guard Test Quiz ${RUN_ID}`), "a still-DRAFT quiz (publish was blocked) must not appear on a student's dashboard");
  ok("quiz correctly remains unpublished and invisible to students after the blocked publish attempt");
  await draftStudent.close();

  // ---------- Normal flow still works: add a question, then publish succeeds ----------
  await addQuestion(admin, quizId, "Guard question 1?");
  await admin.goto(`${BASE}/admin/quizzes/${quizId}`, { waitUntil: "networkidle" });
  await main(admin).getByRole("button", { name: "Published", exact: true }).click();
  await admin.waitForTimeout(800);

  // Check the real persisted status via a fresh navigation to the quizzes
  // list (its badge reflects the DB status directly, unlike re-reading a
  // button's disabled state right after the click, which raced on timing).
  await admin.goto(`${BASE}/admin/quizzes`, { waitUntil: "networkidle" });
  const listRow = main(admin).locator("li", { hasText: `Guard Test Quiz ${RUN_ID}` });
  await assert(await listRow.locator("text=Published").count() > 0, "after adding one question, the quiz should show as Published in the list");
  ok("normal flow unaffected: quiz with a real question publishes successfully");

  // ---------- Cannot delete the last question of a published quiz ----------
  await admin.goto(`${BASE}/admin/quizzes/${quizId}`, { waitUntil: "networkidle" });
  await Promise.all([
    admin.waitForURL((u) => u.searchParams.get("error") === "lastquestion"),
    main(admin).locator("li form button", { hasText: "Delete" }).first().click(),
  ]);
  const lastQErrorText = await main(admin).innerText();
  await assert(lastQErrorText.includes("last question"), "expected the last-question-of-a-published-quiz error message");
  ok("deleting the last question of a published quiz is blocked with a clear message");

  // Confirm the question is still there (deletion was really blocked, not just a display glitch).
  const stillHasQuestion = (await main(admin).innerText()).includes("Guard question 1?");
  await assert(stillHasQuestion, "the question must still exist after the blocked deletion");
  ok("blocked deletion did not actually remove the question");

  // ---------- Adding a 2nd question allows deleting one of them again ----------
  await addQuestion(admin, quizId, "Guard question 2?");
  await admin.goto(`${BASE}/admin/quizzes/${quizId}`, { waitUntil: "networkidle" });
  await Promise.all([
    admin.waitForURL((u) => !u.searchParams.has("error")),
    main(admin).locator("li form button", { hasText: "Delete" }).first().click(),
  ]);
  const afterDeleteText = await main(admin).innerText();
  await assert(afterDeleteText.includes("1"), "one question should remain after deleting one of two");
  ok("with 2+ questions, deleting one down to 1 is allowed (only zero is blocked)");

  await browser.close();
}

run()
  .then(() => {
    const failed = results.filter((r) => !r.pass);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) process.exitCode = 1;
  })
  .catch((err) => {
    fail("question guard checks crashed", err.message || err);
    console.log(`\n${results.filter((r) => r.pass).length}/${results.length} checks passed`);
    process.exitCode = 1;
  });
