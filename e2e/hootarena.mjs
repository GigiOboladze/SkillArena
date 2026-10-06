// End-to-end lifecycle test for HootArena, the live Kahoot-style quiz
// system, against a running dev/prod server. Exercises what's unique to
// HootArena (not already covered by the quiz/program-isolation suites):
// PIN join + real-time eligibility enforcement, all three question types,
// Kahoot-style speed scoring including an all-or-nothing multiple-choice
// miss and a never-answered ("timeout") case, the top-3-only privacy limit
// on the student leaderboard view vs. the full board the host sees,
// same-session reconnect mid-question (must show "already answered" rather
// than re-prompting), duplicate-login kicking the older session, and the
// "reopening HootArena resumes your active game" behavior.
//
// Needs the Super Admin (ADMIN_USERNAME/ADMIN_PASSWORD from .env) and the
// seeded curriculum (`npm run db:seed`) - creates its own throwaway
// students/game, safe against a local dev database only.
// Run: npm run test:e2e:hootarena
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
const STUDENT_PASSWORD = "pass-123456";

async function adminLogin() {
  const page = await browser.newPage();
  await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="username"]', ADMIN_USERNAME);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await Promise.all([page.waitForURL(`${BASE}/admin`), page.click('button[type="submit"]')]);
  return page;
}

async function studentLogin(username) {
  // An explicit context (not browser.newPage()'s implicit one) so a later
  // step can open a second page in this same logged-in session, e.g. to
  // prove "reopening HootArena resumes your active game" from a fresh tab.
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', STUDENT_PASSWORD);
  await Promise.all([page.waitForURL(`${BASE}/dashboard`), page.click('button[type="submit"]')]);
  return page;
}

/** Creates a student under `programLabel` (Super Admin only - switches via the page's own ProgramSelector), assigned to `subjectName` / `groupLabel` (e.g. "I"). */
async function createStudent(admin, username, programLabel, subjectName, groupLabel) {
  await admin.goto(`${BASE}/admin/students`, { waitUntil: "networkidle" });
  await Promise.all([admin.waitForURL(/[?&]program=/), admin.selectOption('select[name="program"]', { label: programLabel })]);
  await admin.waitForLoadState("networkidle");
  await main(admin).locator('input[name="firstName"]').fill("Hoot");
  await main(admin).locator('input[name="lastName"]').fill("Test");
  await main(admin).locator('input[name="username"]').fill(username);
  await main(admin).locator('input[name="password"]').fill(STUDENT_PASSWORD);
  if (groupLabel) {
    await main(admin)
      .getByRole("radiogroup", { name: `${subjectName} group` })
      .getByRole("radio", { name: groupLabel, exact: true })
      .check();
  }
  await Promise.all([
    admin.waitForURL((u) => u.searchParams.get("created") === username.toLowerCase()),
    main(admin).getByRole("button", { name: "Create student" }).click(),
  ]);
}

async function run() {
  const admin = await adminLogin();
  ok("super admin login");

  // ---------- Fixture students ----------
  // Front-end Development, subject "JavaScript" (4 groups I-IV seeded):
  // four eligible Group I players (a1..a4) to get a real 4th-place player
  // for the top-3 privacy check, plus one Group II player (b1) to prove
  // group-targeting is enforced, not just program membership.
  for (const [user, group] of [
    [`e2e-hoot-a1-${RUN_ID}`, "I"],
    [`e2e-hoot-a2-${RUN_ID}`, "I"],
    [`e2e-hoot-a3-${RUN_ID}`, "I"],
    [`e2e-hoot-a4-${RUN_ID}`, "I"],
    [`e2e-hoot-b1-${RUN_ID}`, "II"],
  ]) {
    await createStudent(admin, user, "Front-end Development", "JavaScript", group);
  }
  ok("created 4 eligible (Group I) and 1 ineligible (Group II) Front-end students");

  // Networks program, subject "ინგლისური" Group I - same group LABEL as an
  // eligible player above, different PROGRAM entirely, to prove a matching
  // group number in the wrong program is still rejected.
  await createStudent(admin, `e2e-hoot-net-${RUN_ID}`, "Networks", "ინგლისური", "I");
  ok("created 1 same-group-number student in a different program (Networks)");

  // ---------- Create the game ----------
  await admin.goto(`${BASE}/admin/hootarena/new`, { waitUntil: "networkidle" });
  await admin.fill('input[name="title"]', `E2E Hoot ${RUN_ID}`);
  await admin.selectOption('select[name="subjectId"]', { label: "JavaScript" });
  await Promise.all([
    admin.waitForURL((u) => /\/admin\/hootarena\/[a-z0-9]+$/.test(u.pathname) && !u.pathname.endsWith("/new")),
    main(admin).locator('button[type="submit"]').click(),
  ]);
  const gameId = admin.url().split("/").pop();
  ok(`created HootArena game (${gameId})`);

  // Target Group I only.
  await main(admin).getByRole("checkbox", { name: "Group I", exact: true }).check();
  await main(admin).getByRole("button", { name: "Save subject & groups" }).click();
  await admin.waitForLoadState("networkidle");
  ok("targeted Group I only");

  // ---------- Questions: one of each type ----------
  async function addQuestion({ type, text, options, correct }) {
    await admin.goto(`${BASE}/admin/hootarena/${gameId}/questions/new`, { waitUntil: "networkidle" });
    if (type !== "SINGLE_CHOICE") {
      await admin.selectOption('select[name="type"]', {
        label: type === "MULTIPLE_CHOICE" ? "Multiple Choice - one or more correct answers" : "True / False",
      });
    }
    await admin.fill('textarea[name="text"]', text);
    for (const [i, optText] of options.entries()) {
      await admin.fill(`input[name="opt${i + 1}"]`, optText);
    }
    for (const c of correct) {
      await admin.check(`input[name="correct"][value="${c}"]`);
    }
    await Promise.all([
      admin.waitForURL(`${BASE}/admin/hootarena/${gameId}`),
      main(admin).locator('button[type="submit"]').click(),
    ]);
  }

  await addQuestion({
    type: "SINGLE_CHOICE",
    text: "What year was JavaScript created?",
    options: ["1995", "2000", "2010", "1990"],
    correct: [1],
  });
  await addQuestion({
    type: "MULTIPLE_CHOICE",
    text: "Which of these are JavaScript primitive types?",
    options: ["string", "number", "array", "object"],
    correct: [1, 2],
  });
  await admin.goto(`${BASE}/admin/hootarena/${gameId}/questions/new`, { waitUntil: "networkidle" });
  await admin.selectOption('select[name="type"]', { label: "True / False" });
  await admin.fill('textarea[name="text"]', "JavaScript and Java are the same language.");
  await admin.check('input[name="correct"][value="2"]'); // False
  await Promise.all([
    admin.waitForURL(`${BASE}/admin/hootarena/${gameId}`),
    main(admin).locator('button[type="submit"]').click(),
  ]);
  ok("added one Single Choice, one Multiple Choice, and one True/False question");

  const pinText = await main(admin).locator('span:has-text("Game PIN:")').innerText();
  const pin = pinText.match(/\d{6}/)?.[0];
  await assert(/^\d{6}$/.test(pin), `expected a 6-digit PIN, got "${pinText}"`);
  ok(`game PIN generated: ${pin}`);

  await admin.goto(`${BASE}/admin/hootarena/${gameId}/host`, { waitUntil: "networkidle" });
  // `admin` is the host page itself from here on - same account, one tab.

  // ---------- Eligibility enforcement: wrong group, wrong program ----------
  const b1 = await studentLogin(`e2e-hoot-b1-${RUN_ID}`);
  await b1.goto(`${BASE}/dashboard/hootarena`, { waitUntil: "networkidle" });
  await b1.fill('input[name="pin"]', pin);
  await Promise.all([
    b1.waitForURL((u) => u.searchParams.get("error") === "ineligible"),
    main(b1).locator('button[type="submit"]').click(),
  ]);
  await assert((await main(b1).innerText()).includes("not eligible"), "expected an 'ineligible' message for a Group II student");
  ok("Group II student (same subject, wrong group) is rejected with a friendly message");
  await b1.close();

  const netStudent = await studentLogin(`e2e-hoot-net-${RUN_ID}`);
  await netStudent.goto(`${BASE}/dashboard/hootarena`, { waitUntil: "networkidle" });
  await netStudent.fill('input[name="pin"]', pin);
  await Promise.all([
    netStudent.waitForURL((u) => u.searchParams.get("error") === "ineligible"),
    main(netStudent).locator('button[type="submit"]').click(),
  ]);
  ok("Networks student (matching group NUMBER, wrong program) is rejected");
  await netStudent.close();

  // Malformed / unknown PIN.
  const junkPinPage = await studentLogin(`e2e-hoot-a1-${RUN_ID}`);
  await junkPinPage.goto(`${BASE}/dashboard/hootarena`, { waitUntil: "networkidle" });
  await junkPinPage.fill('input[name="pin"]', "000000");
  await Promise.all([
    junkPinPage.waitForURL((u) => u.searchParams.get("error") === "notfound"),
    main(junkPinPage).locator('button[type="submit"]').click(),
  ]);
  ok("a well-formed but nonexistent PIN is rejected with 'not found', not a crash");

  // ---------- Four eligible players join ----------
  const a1 = junkPinPage; // already logged in as a1 above; reuse the session
  const students = { a1 };
  await a1.goto(`${BASE}/dashboard/hootarena`, { waitUntil: "networkidle" });
  await a1.fill('input[name="pin"]', pin);
  await Promise.all([
    a1.waitForURL(`${BASE}/dashboard/hootarena/play/${gameId}`),
    main(a1).locator('button[type="submit"]').click(),
  ]);
  await a1.waitForSelector(`text=You're in, e2e-hoot-a1-${RUN_ID}!`, { timeout: 10000 });
  ok("a1 joined via PIN and lands in the lobby");

  for (const n of [2, 3, 4]) {
    const username = `e2e-hoot-a${n}-${RUN_ID}`;
    const p = await studentLogin(username);
    await p.goto(`${BASE}/dashboard/hootarena`, { waitUntil: "networkidle" });
    await p.fill('input[name="pin"]', pin);
    await Promise.all([
      p.waitForURL(`${BASE}/dashboard/hootarena/play/${gameId}`),
      main(p).locator('button[type="submit"]').click(),
    ]);
    await p.waitForSelector(`text=You're in, ${username}!`, { timeout: 10000 });
    students[`a${n}`] = p;
  }
  ok("all 4 eligible players joined the lobby");

  // ---------- "Reopening HootArena resumes your active game" ----------
  const a1Resume = await a1.context().newPage();
  await a1Resume.goto(`${BASE}/dashboard/hootarena`, { waitUntil: "networkidle" });
  await assert(a1Resume.url() === `${BASE}/dashboard/hootarena/play/${gameId}`, `expected auto-redirect back into the active game, got ${a1Resume.url()}`);
  await a1Resume.close();
  ok("reopening /dashboard/hootarena while already in an active game resumes it instead of showing the PIN box");

  // ---------- Duplicate login kicks the older session ----------
  const a1Dup = await studentLogin(`e2e-hoot-a1-${RUN_ID}`);
  await a1Dup.goto(`${BASE}/dashboard/hootarena/play/${gameId}`, { waitUntil: "networkidle" });
  await a1Dup.waitForSelector(`text=You're in, e2e-hoot-a1-${RUN_ID}!`, { timeout: 10000 });
  await a1.waitForSelector("text=disconnected", { timeout: 10000 });
  ok("logging in as the same student elsewhere kicks the original session, which sees a clear message");
  await a1.close();
  students.a1 = a1Dup; // the surviving session for a1 going forward

  await admin.waitForSelector("text=4", { timeout: 10000 });
  await admin.waitForSelector('button:has-text("Start game"):not([disabled])', { timeout: 10000 });
  ok("host sees 4 players and can start");

  await admin.click('button:has-text("Start game")');

  // ---------- Q1: Single Choice - staggered answers to test speed scoring + incorrect=0 ----------
  for (const key of ["a1", "a2", "a3", "a4"]) {
    await students[key].waitForSelector("text=What year was JavaScript created?", { timeout: 10000 });
  }
  await students.a1.getByRole("button", { name: "1995", exact: true }).click(); // fastest, correct
  await students.a2.waitForTimeout(1500);
  await students.a2.getByRole("button", { name: "1995", exact: true }).click(); // slower, correct
  await students.a3.waitForTimeout(1500);
  await students.a3.getByRole("button", { name: "1995", exact: true }).click(); // slower still, correct
  await students.a4.getByRole("button", { name: "2000", exact: true }).click(); // wrong -> 0 points
  await admin.waitForSelector("text=4/4 answered", { timeout: 10000 });
  ok("Q1: all 4 answered (3 correct at different speeds, 1 incorrect)");

  await admin.click('button:has-text("Reveal answer")');
  await students.a1.waitForSelector("text=Correct!", { timeout: 10000 });
  await students.a4.waitForSelector("text=Not quite", { timeout: 10000 });
  ok("Q1 reveal: correct players see 'Correct!', the wrong answer sees 'Not quite' (not confused with a timeout)");

  await admin.waitForSelector("text=students", { timeout: 10000 });
  const q1RevealText = await main(admin).innerText();
  await assert(q1RevealText.includes("What year was JavaScript created?"), "admin reveal should show the full question text");
  await assert(/1995[\s\S]{0,40}3 students/.test(q1RevealText), "expected '1995' paired with 3 students (a1, a2, a3)");
  await assert(/2000[\s\S]{0,40}1 student\b/.test(q1RevealText), "expected '2000' paired with 1 student (a4)");
  await assert(/2010[\s\S]{0,40}0 students/.test(q1RevealText), "a zero-selection option ('2010') must still be shown, with 0 students");
  await assert(/1990[\s\S]{0,40}0 students/.test(q1RevealText), "a zero-selection option ('1990') must still be shown, with 0 students");
  await assert(/correct/i.test(q1RevealText), "the correct option must be clearly marked"); // the badge renders uppercase via CSS text-transform
  await assert(!q1RevealText.includes("not answered"), "with 0 unanswered students, the 'not answered' line must not appear");
  const q1StudentText = await main(students.a1).innerText();
  await assert(!q1StudentText.includes("students") && !q1StudentText.includes("%"), "a student's own reveal screen must never show the answer-distribution breakdown");
  ok("Q1 admin reveal shows the full per-option distribution (including zero-selection options) with the correct answer marked; students see none of it");

  await admin.click('button:has-text("Show leaderboard")');
  await admin.waitForSelector(`text=e2e-hoot-a1-${RUN_ID}`, { timeout: 10000 });
  const hostBoardQ1 = await main(admin).innerText();
  for (const n of [1, 2, 3, 4]) {
    await assert(hostBoardQ1.includes(`e2e-hoot-a${n}-${RUN_ID}`), `host leaderboard should include a${n}`);
  }
  ok("host's leaderboard shows the full board - all 4 players");

  await students.a1.waitForSelector("text=Leaderboard so far", { timeout: 10000 });
  const a1BoardText = await main(students.a1).innerText();
  await assert(a1BoardText.includes("top 3"), "a1 (rank 1) should see the 'in the top 3' badge");
  const a4BoardText = await main(students.a4).innerText();
  await assert(!a4BoardText.includes(`e2e-hoot-a4-${RUN_ID}`), "a4 (rank 4, scored 0) must not appear on their own leaderboard view");
  const a4Rows = await students.a4.locator('ol li').count();
  await assert(a4Rows <= 3, `a4's leaderboard view must show at most the top 3 entries, saw ${a4Rows}`);
  ok("students only ever see their own score + top 3 - a4 (4th place) never sees the full board or their own low rank");

  // ---------- Q2: Multiple Choice - all-or-nothing scoring, host-forced reveal before everyone answers (timeout case) ----------
  await admin.click('button:has-text("Next question")');
  for (const key of ["a1", "a2", "a3", "a4"]) {
    await students[key].waitForSelector("text=Which of these are JavaScript primitive types?", { timeout: 10000 });
  }
  await students.a1.getByRole("button", { name: "string", exact: true }).click();
  await students.a1.getByRole("button", { name: "number", exact: true }).click();
  await students.a1.getByRole("button", { name: "Submit Answer" }).click(); // exact correct set
  await students.a2.getByRole("button", { name: "string", exact: true }).click();
  await students.a2.getByRole("button", { name: "Submit Answer" }).click(); // missing "number" -> incorrect
  await students.a3.getByRole("button", { name: "string", exact: true }).click();
  await students.a3.getByRole("button", { name: "number", exact: true }).click();
  await students.a3.getByRole("button", { name: "array", exact: true }).click();
  await students.a3.getByRole("button", { name: "Submit Answer" }).click(); // extra wrong option -> incorrect
  // a4 never answers - stands in for a timeout without the test waiting the full 20s.
  await admin.waitForSelector("text=3/4 answered", { timeout: 10000 });
  ok("Q2: a1 submitted the exact correct set, a2/a3 submitted incomplete/over-selected sets, a4 never answered");

  // Reconnect-mid-question check on the surviving a1 session: reload right
  // after answering and before the reveal - must show "locked in" rather
  // than re-presenting answerable tiles (the reconnect-replay path added to
  // restoreHootStateForSocket in server.ts).
  await students.a1.reload({ waitUntil: "networkidle" });
  await students.a1.waitForSelector("text=Locked in - waiting for the others...", { timeout: 10000 });
  ok("a1 reloading mid-question (after answering) reconnects straight into the 'locked in' state, not a re-answerable question");

  await admin.click('button:has-text("Reveal answer")');
  await students.a1.waitForSelector("text=Correct!", { timeout: 10000 });
  await students.a2.waitForSelector("text=Not quite", { timeout: 10000 });
  await students.a3.waitForSelector("text=Not quite", { timeout: 10000 });
  await students.a4.waitForSelector("text=Time's up!", { timeout: 10000 });
  ok("Q2 reveal: exact set = correct, partial/over-selected = incorrect (all-or-nothing), never-answered = 'Time's up!'");

  // Multiple Choice distribution: a1 selected {string, number}, a2 selected
  // {string}, a3 selected {string, number, array} - the SAME student must
  // contribute to every option they picked, not just one.
  await admin.waitForSelector("text=not answered", { timeout: 10000 });
  const q2RevealText = await main(admin).innerText();
  await assert(q2RevealText.includes("Which of these are JavaScript primitive types?"), "admin reveal should show the Q2 question text");
  await assert(/\bstring[\s\S]{0,40}3 students/.test(q2RevealText), "'string' was picked by a1, a2, and a3 -> 3 students");
  await assert(/\bnumber[\s\S]{0,40}2 students/.test(q2RevealText), "'number' was picked by a1 and a3 -> 2 students");
  await assert(/\barray[\s\S]{0,40}1 student\b/.test(q2RevealText), "'array' was picked by a3 only -> 1 student");
  await assert(/\bobject[\s\S]{0,40}0 students/.test(q2RevealText), "'object' (zero-selection option) must still be shown, with 0 students");
  await assert(q2RevealText.includes("1 not answered"), "a4 never answered Q2 - the aggregate 'not answered' count must show exactly 1");
  ok("Q2 admin reveal correctly counts a multi-select student toward every option they picked, and reports the unanswered count");

  // ---------- Q3: True/False, then finish the game ----------
  await admin.click('button:has-text("Show leaderboard")');
  await admin.click('button:has-text("Next question")');
  for (const key of ["a1", "a2", "a3", "a4"]) {
    await students[key].waitForSelector("text=JavaScript and Java are the same language.", { timeout: 10000 });
  }
  await students.a1.getByRole("button", { name: "False", exact: true }).click(); // correct
  await students.a2.getByRole("button", { name: "True", exact: true }).click(); // wrong
  await students.a3.getByRole("button", { name: "True", exact: true }).click(); // wrong
  await students.a4.getByRole("button", { name: "True", exact: true }).click(); // wrong
  await admin.waitForSelector("text=4/4 answered", { timeout: 10000 });
  await admin.click('button:has-text("Reveal answer")');
  await students.a1.waitForSelector("text=Correct!", { timeout: 10000 });
  ok("Q3 (True/False): correct/incorrect scored the same way as the other two question types");

  await admin.waitForSelector("text=True", { timeout: 10000 });
  const q3RevealText = await main(admin).innerText();
  await assert(/\bTrue[\s\S]{0,40}3 students/.test(q3RevealText), "True was picked by a2, a3, a4 -> 3 students");
  await assert(/\bFalse[\s\S]{0,40}1 student\b/.test(q3RevealText), "False (correct) was picked by a1 only -> 1 student");
  await assert(!q3RevealText.includes("not answered"), "everyone answered Q3 - the 'not answered' line must not appear");
  ok("Q3 (True/False) admin reveal shows the True/False distribution with the correct side marked");

  await admin.click('button:has-text("Show leaderboard")');
  await admin.waitForSelector('button:has-text("Finish game")', { timeout: 10000 });
  ok("host's final control correctly reads 'Finish game' rather than 'Next question' on the last question");
  await admin.click('button:has-text("Finish game")');

  await admin.waitForSelector("text=Final results", { timeout: 10000 });
  const finalHostText = await main(admin).innerText();
  for (const n of [1, 2, 3, 4]) {
    await assert(finalHostText.includes(`e2e-hoot-a${n}-${RUN_ID}`), `final host leaderboard should include a${n}`);
  }
  ok("host's final results show the complete leaderboard (all 4 players)");

  for (const key of ["a1", "a2", "a3", "a4"]) {
    await students[key].waitForSelector("text=Your final score", { timeout: 10000 });
  }
  const a4FinalText = await main(students.a4).innerText();
  await assert(!a4FinalText.includes(`e2e-hoot-a4-${RUN_ID}`), "a4 must not see themselves (or anyone past 3rd) on their own final results");
  ok("students' final results also stay limited to their own score + top 3, never the full board");

  // ---------- A finished game is no longer joinable ----------
  // Reuses the (ineligible) Networks student's login - FINISHED must be
  // checked and rejected before eligibility is even evaluated, so this
  // still proves the "no longer joinable" behavior specifically.
  const freshPinCheck = await studentLogin(`e2e-hoot-net-${RUN_ID}`);
  await freshPinCheck.goto(`${BASE}/dashboard/hootarena`, { waitUntil: "networkidle" });
  await freshPinCheck.fill('input[name="pin"]', pin);
  await Promise.all([
    freshPinCheck.waitForURL((u) => u.searchParams.get("error") === "ended"),
    main(freshPinCheck).locator('button[type="submit"]').click(),
  ]);
  ok("a finished game's PIN is rejected as ended, not joinable anymore");
  await freshPinCheck.close();
}

try {
  await run();
} catch (err) {
  fail("hootarena e2e crashed", err?.stack || err);
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("FAILURES:", failed);
    process.exitCode = 1;
  }
}
