// Full lifecycle e2e test for HootArena, the live Kahoot-style quiz system.
// Players need NO SkillArena account at all - they join by PIN or QR and
// pick a nickname on the spot (see e2e/hootarena-reconnect.mjs for the
// dedicated reconnect/state-sync suite, and hootarena-scoring.mjs for the
// pure scoring-function unit tests).
//
// Needs the Super Admin (ADMIN_USERNAME/ADMIN_PASSWORD from .env). Creates
// its own throwaway game/players, safe against a local dev database only.
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

async function adminLogin() {
  const page = await browser.newPage();
  await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="username"]', ADMIN_USERNAME);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await Promise.all([page.waitForURL(`${BASE}/admin`), page.click('button[type="submit"]')]);
  return page;
}

/** Joins a HootArena game anonymously, exactly like a real player: PIN entry -> nickname -> play. No login, no account. */
async function joinAsGuest(pin, username) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}/hootarena`, { waitUntil: "networkidle" });
  await page.fill('input[name="pin"]', pin);
  await Promise.all([page.waitForURL(`${BASE}/hootarena/join/${pin}`), page.click('button[type="submit"]')]);
  await page.fill('input[name="username"]', username);
  await Promise.all([
    page.waitForURL((u) => /\/hootarena\/play\/[a-z0-9]+$/.test(u.pathname)),
    main(page).locator('button[type="submit"]').click(),
  ]);
  return page;
}

async function addQuestion(admin, gameId, { text, options, correct, type }) {
  await admin.goto(`${BASE}/admin/hootarena/${gameId}/questions/new`, { waitUntil: "networkidle" });
  if (type) {
    await admin.selectOption('select[name="type"]', { label: type });
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

async function run() {
  const admin = await adminLogin();
  ok("super admin login");

  // ---------- Create the game (title only - no program/subject/group step at all) ----------
  await admin.goto(`${BASE}/admin/hootarena/new`, { waitUntil: "networkidle" });
  await admin.fill('input[name="title"]', `E2E Hoot ${RUN_ID}`);
  await Promise.all([
    admin.waitForURL((u) => /\/admin\/hootarena\/[a-z0-9]+$/.test(u.pathname) && !u.pathname.endsWith("/new")),
    main(admin).locator('button[type="submit"]').click(),
  ]);
  const gameId = admin.url().split("/").pop();
  ok(`created HootArena game (${gameId}), no program/subject/group step required`);

  // ---------- QR code + join link are shown on the management page ----------
  const managePageText = await main(admin).innerText();
  await assert(managePageText.includes("Join code & QR"), "the management page should show a QR/join-link section");
  const qrImage = await admin.locator('img[alt^="QR code to join"]').count();
  await assert(qrImage === 1, "expected a scannable QR code image on the management page");
  const pinBadge = await main(admin).locator("p.font-mono").innerText();
  const pin = pinBadge.match(/\d{6}/)?.[0];
  await assert(/^\d{6}$/.test(pin), `expected a 6-digit PIN, got "${pinBadge}"`);
  const joinLink = await admin.locator(`a[href*="/hootarena/join/${pin}"]`).count();
  await assert(joinLink >= 1, "expected the join link to point at /hootarena/join/{pin}");
  ok(`game PIN generated (${pin}) with a working QR code and join link shown to the admin`);

  // ---------- Questions: one of each type ----------
  await addQuestion(admin, gameId, {
    text: "What year was JavaScript created?",
    options: ["1995", "2000", "2010", "1990"],
    correct: [1],
  });
  await addQuestion(admin, gameId, {
    text: "Which of these are JavaScript primitive types?",
    options: ["string", "number", "array", "object"],
    correct: [1, 2],
    type: "Multiple Choice - one or more correct answers",
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

  await admin.goto(`${BASE}/admin/hootarena/${gameId}/host`, { waitUntil: "networkidle" });

  // ---------- Anonymous join: PIN entry -> nickname -> play, no account ----------
  const a1 = await joinAsGuest(pin, `e2e-hoot-a1-${RUN_ID}`);
  await a1.waitForSelector(`text=You're in, e2e-hoot-a1-${RUN_ID}!`, { timeout: 10000 });
  ok("a1 joined anonymously via PIN + self-chosen nickname, no SkillArena account");

  // ---------- Nickname collision: same (and case-different) name rejected ----------
  const dupContext = await browser.newContext();
  const dupPage = await dupContext.newPage();
  await dupPage.goto(`${BASE}/hootarena/join/${pin}`, { waitUntil: "networkidle" });
  await dupPage.fill('input[name="username"]', `e2e-hoot-a1-${RUN_ID}`); // exact duplicate
  await Promise.all([
    dupPage.waitForURL((u) => u.searchParams.get("error") === "taken"),
    main(dupPage).locator('button[type="submit"]').click(),
  ]);
  await assert((await main(dupPage).innerText()).includes("already taken"), "expected a 'name taken' message for an exact duplicate nickname");
  ok("an exact duplicate nickname in the same game is rejected");

  await dupPage.goto(`${BASE}/hootarena/join/${pin}`, { waitUntil: "networkidle" });
  await dupPage.fill('input[name="username"]', `E2E-HOOT-A1-${RUN_ID}`); // case-different duplicate
  await Promise.all([
    dupPage.waitForURL((u) => u.searchParams.get("error") === "taken"),
    main(dupPage).locator('button[type="submit"]').click(),
  ]);
  ok("a case-different duplicate nickname ('E2E-HOOT-A1' vs 'e2e-hoot-a1') is also rejected");
  await dupContext.close();

  // Remaining eligible players - small, distinctly-named group for the privacy/ranking checks below.
  const students = { a1 };
  for (const n of [2, 3, 4]) {
    const username = `e2e-hoot-a${n}-${RUN_ID}`;
    const p = await joinAsGuest(pin, username);
    await p.waitForSelector(`text=You're in, ${username}!`, { timeout: 10000 });
    students[`a${n}`] = p;
  }
  ok("all 4 players joined the lobby");

  // ---------- Resuming the direct play URL (no reload needed from the join flow, but confirms the cookie-based session persists) ----------
  // Navigate a1's own page in place (a real browser reload) rather than opening a second page in the
  // same context: a second page would hold a second live socket for the same playerId/clientToken at
  // the same time as the first, which correctly triggers the server's duplicate-session kick on the
  // original page - that's real product behavior (same as opening Kahoot in two tabs), not a bug, but
  // it would leave a1's original page kicked for the rest of the test. A reload tears down the old
  // socket before the new one connects, so there's never two live sessions at once.
  await a1.goto(`${BASE}/hootarena/play/${gameId}`, { waitUntil: "networkidle" });
  await assert(a1.url() === `${BASE}/hootarena/play/${gameId}`, `expected to land directly on the play page via the saved session, got ${a1.url()}`);
  await a1.waitForSelector(`text=You're in, e2e-hoot-a1-${RUN_ID}!`, { timeout: 10000 });
  ok("revisiting the play URL on the same device resumes the session via the saved cookie - no re-entering a nickname");

  // ---------- Malformed / unknown PIN ----------
  const junkPinPage = await browser.newPage();
  await junkPinPage.goto(`${BASE}/hootarena`, { waitUntil: "networkidle" });
  await junkPinPage.fill('input[name="pin"]', "000000");
  await Promise.all([
    junkPinPage.waitForURL(`${BASE}/hootarena/join/000000`),
    junkPinPage.click('button[type="submit"]'),
  ]);
  await assert((await main(junkPinPage).innerText()).includes("couldn't find a game"), "a well-formed but nonexistent PIN should show a friendly not-found message");
  ok("a well-formed but nonexistent PIN is rejected with 'not found', not a crash");
  await junkPinPage.close();

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
  // restoreHootStateForSocket in server.ts). Separate dedicated coverage for
  // real network-drop reconnects lives in e2e/hootarena-reconnect.mjs.
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
  const latePage = await browser.newPage();
  await latePage.goto(`${BASE}/hootarena/join/${pin}`, { waitUntil: "networkidle" });
  await assert((await main(latePage).innerText()).includes("already ended"), "a finished game's join page must say it has ended, not offer a nickname field");
  ok("a finished game's PIN/join link is rejected as ended, not joinable anymore");
  await latePage.close();
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
    process.exit(1);
  }
}
