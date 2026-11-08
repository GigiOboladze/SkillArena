// Launch-readiness regression suite (2026-11-07). Covers the bugs found in the
// pre-launch review plus the features no other suite exercised:
//
//   1. Editing a quiz question must NOT erase students' saved answers.
//   2. HootArena "Move up / Move down" must work (used to crash on a unique index).
//   3. SkillArena quizzes are unreachable through the legacy LIVE/ASYNC flows,
//      and the public homework form cannot create a QUIZ-mode row.
//   4. Unpublishing a quiz hides it from the dashboard but lets a student who
//      already started it finish.
//   5. An expired question timer locks the question.
//   6. Super Admin creates a program and a subject (groups follow groupCount).
//   7. A student changes their username and logs in with it.
//   8. An admin deletes a student.
//   8b. Reset password from the students list (new password works, old doesn't).
//   8c. Legacy homework: clamped points/time, forged option ids, closing stops answers.
//   8d. A finished HootArena game no longer claims to be live.
//   9. Every page renders for every role - no 500s, no client errors, no
//      horizontal overflow on a phone - in both themes.
//
// Creates and deletes its own throwaway rows (RUN_ID-suffixed); safe against a
// local/dev database only.
import "dotenv/config";
import { chromium } from "playwright";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { hashPassword } from "../src/lib/password.ts";

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
/** Runs one named check; a failure is recorded and the suite carries on with the next one. */
async function check(name, fn) {
  try { await fn(); ok(name); } catch (err) { fail(name, err?.stack || err); }
}

const prisma = new PrismaClient();
const browser = await chromium.launch();
const RUN_ID = Date.now();
const created = { users: [], homeworks: [], hootGames: [], programs: [] };

async function loginPage(path, landing, username, password, context) {
  const page = await (context ?? (await browser.newContext())).newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL(`${BASE}${landing}`), page.click('button[type="submit"]')]);
  return page;
}
/**
 * Clicks a button that submits a server action and waits for that action's
 * POST to finish. (waitForLoadState("networkidle") is NOT enough: it resolves
 * at once if the page was already idle, before the action has even run.)
 */
async function submitAction(page, locator) {
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().startsWith(BASE)),
    locator.click(),
  ]);
}
const adminLogin = () => loginPage("/admin/login", "/admin", ADMIN_USERNAME, ADMIN_PASSWORD);
const studentLogin = (u, p) => loginPage("/login", "/dashboard", u, p);

async function makeStudent(tag, groupId, subjectId, programId) {
  const username = `lr-${tag}-${RUN_ID}`.toLowerCase();
  const user = await prisma.user.create({
    data: {
      firstName: `LR ${tag}`, lastName: "Tester", username, role: "STUDENT", programId,
      passwordHash: await hashPassword("lr-pass-123456"),
      subjectGroups: { create: [{ subjectId, groupId }] },
    },
  });
  created.users.push(user.id);
  return { ...user, password: "lr-pass-123456" };
}

async function makeQuiz(tag, subjectId, groupId, questionCount, ownerId) {
  const quiz = await prisma.homework.create({
    data: {
      title: `LR ${tag} ${RUN_ID}`, mode: "QUIZ", status: "OPEN", subjectId, ownerUserId: ownerId,
      joinCode: `L${String(RUN_ID).slice(-4)}${tag.slice(0, 1).toUpperCase()}${Math.floor(Math.random() * 10)}`.slice(0, 6),
      targetGroups: { create: [{ groupId }] },
      questions: {
        create: Array.from({ length: questionCount }, (_, i) => ({
          order: i, type: "MULTIPLE_CHOICE", text: `${tag} question ${i + 1}`, points: 1, timeLimitSec: 100,
          options: { create: [0, 1, 2, 3].map((o) => ({ text: `${tag}-q${i}-opt${o}`, isCorrect: o === 0, order: o })) },
        })),
      },
    },
    include: { questions: { orderBy: { order: "asc" }, include: { options: { orderBy: { order: "asc" } } } } },
  });
  created.homeworks.push(quiz.id);
  return quiz;
}

async function run() {
  const fe = await prisma.program.findFirstOrThrow({
    where: { name: "Front-end Development" },
    include: { subjects: { where: { name: "JavaScript" }, include: { groups: { orderBy: { order: "asc" } } } } },
  });
  const js = fe.subjects[0];
  const group = js.groups[0];
  const superAdmin = await prisma.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN" } });

  const admin = await adminLogin();
  admin.on("dialog", (d) => d.accept());

  // ---------- 1. Editing a question keeps students' saved answers ----------
  const s1 = await makeStudent("edit", group.id, js.id, fe.id);
  const editQuiz = await makeQuiz("edit", js.id, group.id, 2, superAdmin.id);
  const [q0] = editQuiz.questions;
  const correctOption = q0.options[0];
  const student = await studentLogin(s1.username, s1.password);
  student.on("dialog", (d) => d.accept());

  await check("question edit keeps an in-progress student's selected answer", async () => {
    await student.goto(`${BASE}/quiz/${editQuiz.id}`, { waitUntil: "networkidle" });
    await Promise.all([student.waitForURL(`${BASE}/quiz/${editQuiz.id}/q/0`), student.getByRole("button", { name: "Enter Arena" }).click()]);
    await student.getByRole("button", { name: correctOption.text }).click();
    await student.locator(`button[aria-pressed="true"]`).waitFor({ timeout: 15000 });

    const attempt = await prisma.quizAttempt.findUniqueOrThrow({ where: { studentId_homeworkId: { studentId: s1.id, homeworkId: editQuiz.id } } });
    const before = await prisma.attemptAnswer.findUniqueOrThrow({ where: { attemptId_questionId: { attemptId: attempt.id, questionId: q0.id } } });
    await assert(before.selectedOptionId === correctOption.id, "the student's click should have been saved");

    await admin.goto(`${BASE}/admin/quizzes/${editQuiz.id}/questions/${q0.id}/edit`, { waitUntil: "networkidle" });
    await admin.locator('[name="text"]').fill("edit question 1 (typo fixed)");
    await Promise.all([admin.waitForURL(`${BASE}/admin/quizzes/${editQuiz.id}`), admin.getByRole("button", { name: /save/i }).click()]);

    const after = await prisma.attemptAnswer.findUniqueOrThrow({ where: { id: before.id } });
    await assert(after.selectedOptionId === correctOption.id, `selection was lost by the edit (now ${after.selectedOptionId})`);
    const opts = await prisma.option.findMany({ where: { questionId: q0.id } });
    await assert(opts.length === 4 && opts.some((o) => o.id === correctOption.id), "options should keep their ids");
    const q = await prisma.question.findUniqueOrThrow({ where: { id: q0.id } });
    await assert(q.text === "edit question 1 (typo fixed)", "question text should be updated");
  });

  await check("the preserved answer is graded correct on submit", async () => {
    await student.goto(`${BASE}/quiz/${editQuiz.id}/review`, { waitUntil: "networkidle" });
    await Promise.all([student.waitForURL(`${BASE}/quiz/${editQuiz.id}/result`), student.getByRole("button", { name: "Submit quiz" }).click()]);
    const attempt = await prisma.quizAttempt.findUniqueOrThrow({ where: { studentId_homeworkId: { studentId: s1.id, homeworkId: editQuiz.id } } });
    await assert(attempt.status === "COMPLETED" && attempt.score === 1, `expected COMPLETED 1/2, got ${attempt.status} ${attempt.score}/${attempt.totalQuestions}`);
    const resultText = await student.locator("main").innerText();
    await assert(resultText.includes(`Your answer: ${correctOption.text}`), "result page should still show the student's answer");
  });

  // ---------- 2. HootArena question reordering ----------
  await check("HootArena Move down / Move up reorder questions without an error", async () => {
    const pin = String(100000 + Math.floor(Math.random() * 899999));
    const game = await prisma.hootGame.create({
      data: {
        title: `LR hoot ${RUN_ID}`, pin, hostId: superAdmin.id,
        questions: { create: [0, 1, 2].map((i) => ({ order: i, type: "SINGLE_CHOICE", text: `hoot ${i}`, options: { create: [{ text: "a", isCorrect: true, order: 0 }, { text: "b", isCorrect: false, order: 1 }] } })) },
      },
      include: { questions: { orderBy: { order: "asc" } } },
    });
    created.hootGames.push(game.id);
    const [h0, h1, h2] = game.questions;

    await admin.goto(`${BASE}/admin/hootarena/${game.id}`, { waitUntil: "networkidle" });
    await submitAction(admin, admin.locator('button[title="Move down"]').first());
    let orders = Object.fromEntries((await prisma.hootQuestion.findMany({ where: { gameId: game.id } })).map((q) => [q.id, q.order]));
    await assert(orders[h0.id] === 1 && orders[h1.id] === 0 && orders[h2.id] === 2, `after Move down: ${JSON.stringify(orders)}`);

    await admin.reload({ waitUntil: "networkidle" });
    await submitAction(admin, admin.locator('button[title="Move up"]').last());
    orders = Object.fromEntries((await prisma.hootQuestion.findMany({ where: { gameId: game.id } })).map((q) => [q.id, q.order]));
    await assert(orders[h2.id] === 1 && orders[h0.id] === 2, `after Move up: ${JSON.stringify(orders)}`);
    const text = await admin.locator("body").innerText();
    await assert(!/something went wrong|application error/i.test(text), "an error page was shown");
  });

  // ---------- 3. Legacy flows cannot reach SkillArena quizzes ----------
  await check("a quiz's join code is 'not found' on the anonymous join page", async () => {
    const anon = await (await browser.newContext()).newPage();
    await anon.goto(`${BASE}/join/${editQuiz.joinCode}`, { waitUntil: "networkidle" });
    await assert((await anon.locator("body").innerText()).includes("Code not found"), "quiz should not be joinable anonymously");
    await anon.close();
  });

  await check("the legacy homework editor refuses SkillArena quizzes, even for admins", async () => {
    await admin.goto(`${BASE}/homeworks/${editQuiz.id}`, { waitUntil: "networkidle" });
    const text = await admin.locator("body").innerText();
    await assert(/not your homework to manage|not found/i.test(text), "legacy editor must not manage a QUIZ");
  });

  await check("the public homework form cannot create a QUIZ-mode row", async () => {
    const anon = await (await browser.newContext()).newPage();
    await anon.goto(`${BASE}/homeworks/new`, { waitUntil: "networkidle" });
    await anon.fill('input[name="title"]', `LR forged ${RUN_ID}`);
    await anon.evaluate(() => {
      const radio = document.querySelector('input[name="mode"][value="ASYNC"]');
      radio.value = "QUIZ";
      radio.checked = true;
    });
    await Promise.all([anon.waitForURL((u) => /\/homeworks\/(?!new\b)[^/]+$/.test(u.pathname)), anon.locator('button[type="submit"]').click()]);
    const hw = await prisma.homework.findFirstOrThrow({ where: { title: `LR forged ${RUN_ID}` } });
    created.homeworks.push(hw.id);
    await assert(hw.mode === "ASYNC", `forged mode was accepted: ${hw.mode}`);
    await anon.close();
  });

  // ---------- 4. Unpublishing ----------
  await check("unpublishing hides a quiz, but a started attempt can still be finished", async () => {
    const started = await makeQuiz("started", js.id, group.id, 1, superAdmin.id);
    const untouched = await makeQuiz("untouched", js.id, group.id, 1, superAdmin.id);

    await student.goto(`${BASE}/quiz/${started.id}`, { waitUntil: "networkidle" });
    await Promise.all([student.waitForURL(`${BASE}/quiz/${started.id}/q/0`), student.getByRole("button", { name: "Enter Arena" }).click()]);

    for (const quiz of [started, untouched]) {
      await admin.goto(`${BASE}/admin/quizzes/${quiz.id}`, { waitUntil: "networkidle" });
      await submitAction(admin, admin.getByRole("button", { name: "Draft", exact: true }));
      const row = await prisma.homework.findUniqueOrThrow({ where: { id: quiz.id } });
      await assert(row.status === "DRAFT", `status should be DRAFT, got ${row.status}`);
    }

    await student.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    const dash = await student.locator("main").innerText();
    await assert(!dash.includes(untouched.title), "an unpublished quiz must not be offered on the dashboard");

    await student.goto(`${BASE}/quiz/${started.id}/q/0`, { waitUntil: "networkidle" });
    await student.getByRole("button", { name: started.questions[0].options[0].text }).click();
    await student.locator(`button[aria-pressed="true"]`).waitFor({ timeout: 15000 });
    await student.goto(`${BASE}/quiz/${started.id}/review`, { waitUntil: "networkidle" });
    await Promise.all([student.waitForURL(`${BASE}/quiz/${started.id}/result`), student.getByRole("button", { name: "Submit quiz" }).click()]);
    const attempt = await prisma.quizAttempt.findUniqueOrThrow({ where: { studentId_homeworkId: { studentId: s1.id, homeworkId: started.id } } });
    await assert(attempt.status === "COMPLETED" && attempt.score === 1, `expected COMPLETED 1/1, got ${attempt.status} ${attempt.score}`);
  });

  // ---------- 5. Timer expiry ----------
  await check("an expired question is locked and ignores new answers", async () => {
    const timed = await makeQuiz("timed", js.id, group.id, 2, superAdmin.id);
    await student.goto(`${BASE}/quiz/${timed.id}`, { waitUntil: "networkidle" });
    await Promise.all([student.waitForURL(`${BASE}/quiz/${timed.id}/q/0`), student.getByRole("button", { name: "Enter Arena" }).click()]);
    const attempt = await prisma.quizAttempt.findUniqueOrThrow({ where: { studentId_homeworkId: { studentId: s1.id, homeworkId: timed.id } } });
    await prisma.attemptAnswer.updateMany({ where: { attemptId: attempt.id, questionId: timed.questions[0].id }, data: { deadlineAt: new Date(Date.now() - 1000) } });

    await student.goto(`${BASE}/quiz/${timed.id}/q/0`, { waitUntil: "networkidle" });
    await assert((await student.locator("main").innerText()).includes("Time's up for this question"), "locked message missing");
    const disabled = await student.getByRole("button", { name: timed.questions[0].options[0].text }).isDisabled();
    await assert(disabled, "answer buttons must be disabled once time is up");
    const row = await prisma.attemptAnswer.findFirstOrThrow({ where: { attemptId: attempt.id, questionId: timed.questions[0].id } });
    await assert(row.selectedOptionId === null, "no answer should be recorded after the deadline");
  });

  // ---------- 6. Programs and subjects ----------
  await check("Super Admin creates a program and a subject; groups follow the program's group count", async () => {
    const name = `LR Program ${RUN_ID}`;
    await admin.goto(`${BASE}/admin/programs`, { waitUntil: "networkidle" });
    await admin.locator('main input[name="name"]').fill(name);
    await admin.locator('main [name="groupCount"]').fill("2");
    await Promise.all([admin.waitForURL(/created=1/), admin.locator("main form").getByRole("button").first().click()]);
    const program = await prisma.program.findUniqueOrThrow({ where: { name } });
    created.programs.push(program.id);
    await assert(program.groupCount === 2, `groupCount should be 2, got ${program.groupCount}`);

    await admin.goto(`${BASE}/admin/programs/${program.id}`, { waitUntil: "networkidle" });
    await admin.locator('main input[name="name"]').fill("LR Subject");
    await Promise.all([admin.waitForURL(/created=1/), admin.locator("main form").getByRole("button").first().click()]);
    const subject = await prisma.subject.findFirstOrThrow({ where: { programId: program.id }, include: { groups: { orderBy: { order: "asc" } } } });
    await assert(subject.groups.map((g) => g.name).join(",") === "Group I,Group II", `groups: ${subject.groups.map((g) => g.name)}`);
  });

  // ---------- 7. Student username change ----------
  await check("a student changes their username and can log in with the new one", async () => {
    const s2 = await makeStudent("rename", group.id, js.id, fe.id);
    const page = await studentLogin(s2.username, s2.password);
    const newName = `lr-renamed-${RUN_ID}`;
    await page.goto(`${BASE}/dashboard/profile`, { waitUntil: "networkidle" });
    await page.locator("main summary[aria-label='Change username']").click();
    await page.locator('main input[name="username"]').fill(newName);
    await Promise.all([page.waitForURL(/updated=username/), page.locator('main input[name="username"]').press("Enter")]);
    await page.context().close();
    const again = await studentLogin(newName, s2.password);
    await again.context().close();
  });

  // ---------- 8. Deleting a student ----------
  await check("an admin finds a student by search and deletes them from the list", async () => {
    const s3 = await makeStudent("delete", group.id, js.id, fe.id);
    await admin.goto(`${BASE}/admin/students?q=${encodeURIComponent(s3.username)}`, { waitUntil: "networkidle" });
    await admin.locator("main").locator("summary[aria-label^='Actions for']").first().click();
    const deleteButtons = admin.locator("main").getByRole("button", { name: "Delete", exact: true });
    await assert((await deleteButtons.count()) === 1, `search should narrow the list to one student, got ${await deleteButtons.count()}`);
    await submitAction(admin, deleteButtons.first());
    const gone = await prisma.user.findUnique({ where: { id: s3.id } });
    await assert(!gone, "student row should be deleted");
  });

  // ---------- 8b. Resetting a password from the list ----------
  await check("Reset password on the students list issues a new password; the old one stops working", async () => {
    const s4 = await makeStudent("reset", group.id, js.id, fe.id);
    await admin.goto(`${BASE}/admin/students?q=${encodeURIComponent(s4.username)}`, { waitUntil: "networkidle" });
    await admin.locator("main").locator("summary[aria-label^='Actions for']").first().click();
    const resetButtons = admin.locator("main").getByRole("button", { name: "Reset password", exact: true });
    await assert((await resetButtons.count()) === 1, `expected one Reset password button, got ${await resetButtons.count()}`);
    await Promise.all([admin.waitForURL(/created=/), resetButtons.first().click()]);
    const flash = await admin.locator("main").innerText();
    const match = flash.match(/Password:\s*(\S+)/);
    await assert(match, "the new password should be shown once");
    const before = await prisma.user.findUniqueOrThrow({ where: { id: s4.id } });
    await assert(before.sessionVersion > 0, "a reset must sign the student out everywhere (sessionVersion bump)");
    const fresh = await (await browser.newContext()).newPage();
    await fresh.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await fresh.fill('input[name="username"]', s4.username);
    await fresh.fill('input[name="password"]', s4.password);
    await Promise.all([fresh.waitForURL(/error=invalid/), fresh.click('button[type="submit"]')]);
    await fresh.fill('input[name="username"]', s4.username);
    await fresh.fill('input[name="password"]', match[1]);
    await Promise.all([fresh.waitForURL(`${BASE}/dashboard`), fresh.click('button[type="submit"]')]);
    await fresh.close();
  });

  // ---------- 8c. Legacy self-paced homework hardening ----------
  const creator = await (await browser.newContext()).newPage();
  await creator.goto(`${BASE}/homeworks/new`, { waitUntil: "networkidle" });
  await creator.fill('input[name="title"]', `LR legacy ${RUN_ID}`);
  await Promise.all([creator.waitForURL((u) => /\/homeworks\/(?!new\b)[^/]+$/.test(u.pathname)), creator.locator('button[type="submit"]').click()]);
  const legacy = await prisma.homework.findFirstOrThrow({ where: { title: `LR legacy ${RUN_ID}` } });
  created.homeworks.push(legacy.id);

  await check("legacy question: out-of-range points / time limit are clamped instead of crashing (was a 500)", async () => {
    await creator.goto(`${BASE}/homeworks/${legacy.id}/questions/new`, { waitUntil: "networkidle" });
    await creator.fill('textarea[name="text"]', "LR q1");
    await creator.evaluate(() => {
      for (const name of ["points", "timeLimitSec"]) {
        const input = document.querySelector(`input[name="${name}"]`);
        input.removeAttribute("max");
        input.value = "99999999999";
      }
    });
    await creator.fill('input[name="opt1"]', "right");
    await creator.fill('input[name="opt2"]', "wrong");
    await creator.locator('input[name="correct"][value="1"]').check();
    await Promise.all([creator.waitForURL(`${BASE}/homeworks/${legacy.id}`), creator.getByRole("button", { name: "Add question" }).click()]);
    const q = await prisma.question.findFirstOrThrow({ where: { homeworkId: legacy.id, text: "LR q1" } });
    await assert(q.points === 10000 && q.timeLimitSec === 600, `expected clamping to 10000 pts / 600 s, got ${q.points} / ${q.timeLimitSec}`);
  });

  await check("legacy answer: an option id from another question is never stored", async () => {
    await prisma.homework.update({ where: { id: legacy.id }, data: { status: "OPEN" } });
    const foreign = await prisma.option.findFirstOrThrow({ where: { question: { homeworkId: { not: legacy.id } } } });
    const kid = await (await browser.newContext()).newPage();
    await kid.goto(`${BASE}/join/${legacy.joinCode}`, { waitUntil: "networkidle" });
    await kid.fill('input[name="firstName"]', "LR");
    await kid.fill('input[name="lastName"]', `Kid ${RUN_ID}`);
    await Promise.all([kid.waitForURL(/\/play\/.+\/q\/0$/), kid.locator('button[type="submit"]').click()]);
    // Post the page's own form with a forged optionId (progressive-enhancement submit).
    // Read the server-rendered form (with its progressive-enhancement action
    // fields) and replay it with a forged optionId, the way a hand-made POST would.
    const status = await kid.evaluate(async (forged) => {
      const html = await (await fetch(location.href)).text();
      const form = new DOMParser().parseFromString(html, "text/html").querySelector("form");
      const fd = new FormData();
      for (const input of form.querySelectorAll("input")) {
        if (input.name && input.type !== "radio") fd.append(input.name, input.value);
      }
      fd.set("optionId", forged);
      const res = await fetch(location.href, { method: "POST", body: fd });
      return res.status;
    }, foreign.id);
    await assert(status < 500, `forged submit returned HTTP ${status}`);
    const q = await prisma.question.findFirstOrThrow({ where: { homeworkId: legacy.id } });
    const answer = await prisma.answer.findFirstOrThrow({ where: { questionId: q.id } });
    await assert(answer.selectedOptionId === null && answer.isCorrect === false && answer.pointsAwarded === 0, `forged option stored: ${JSON.stringify(answer)}`);
    await kid.close();
  });

  await check("legacy answer: closing a homework stops submissions from a page left open", async () => {
    await prisma.question.create({
      data: { homeworkId: legacy.id, order: 1, type: "MULTIPLE_CHOICE", text: "LR q2", points: 100, timeLimitSec: 20, options: { create: [{ text: "x", isCorrect: true, order: 0 }, { text: "y", isCorrect: false, order: 1 }] } },
    });
    const kid = await (await browser.newContext()).newPage();
    await kid.goto(`${BASE}/join/${legacy.joinCode}`, { waitUntil: "networkidle" });
    await kid.fill('input[name="firstName"]', "LR");
    await kid.fill('input[name="lastName"]', `Late ${RUN_ID}`);
    await Promise.all([kid.waitForURL(/\/play\/.+\/q\/0$/), kid.locator('button[type="submit"]').click()]);
    await prisma.homework.update({ where: { id: legacy.id }, data: { status: "CLOSED" } });
    await Promise.all([kid.waitForURL(/\/done$/), kid.locator("form button").first().click()]);
    const text = await kid.locator("body").innerText();
    await assert(/homework closed/i.test(text), `expected the closed message, got: ${text.slice(0, 200)}`);
    const student = await prisma.student.findFirstOrThrow({ where: { homeworkId: legacy.id, lastName: `Late ${RUN_ID}` } });
    await assert((await prisma.answer.count({ where: { studentId: student.id } })) === 0, "no answer may be saved after closing");
    await kid.close();
  });
  await creator.close();

  // ---------- 8d. A finished HootArena game ----------
  await check("a finished HootArena game says Finished and no longer shows its join code", async () => {
    const pin = String(100000 + Math.floor(Math.random() * 899999));
    const game = await prisma.hootGame.create({ data: { title: `LR done hoot ${RUN_ID}`, pin, hostId: superAdmin.id, status: "FINISHED" } });
    created.hootGames.push(game.id);
    await admin.goto(`${BASE}/admin/hootarena/${game.id}`, { waitUntil: "networkidle" });
    await admin.getByText("View final results").waitFor();
    const text = await admin.locator("main").innerText(); // badges are text-transform: uppercase
    await assert(/\bfinished\b/i.test(text) && !/\blive\b/i.test(text), `status badge should read Finished: ${text.slice(0, 300)}`);
    await assert(!text.includes(pin) && !text.includes("Join code"), "a finished game must not advertise its PIN");
    await assert(text.includes("View final results"), "should link to the final results");
  });

  // ---------- 9. Every page renders for every role ----------
  const studentPages = ["/dashboard", "/dashboard/leaderboard", "/dashboard/bug-reports", "/dashboard/bug-reports/new", "/dashboard/inco", "/dashboard/profile", `/quiz/${editQuiz.id}/result`];
  const hoot = created.hootGames[0];
  const adminPages = [
    "/admin", "/admin/quizzes", "/admin/quizzes/new", `/admin/quizzes/${editQuiz.id}`, `/admin/quizzes/${editQuiz.id}/results`,
    `/admin/quizzes/${editQuiz.id}/questions/new`, `/admin/quizzes/${editQuiz.id}/questions/${q0.id}/edit`,
    "/admin/students", `/admin/students/${s1.id}`, `/admin/students/${s1.id}/edit`, "/admin/leaderboard",
    "/admin/bug-reports", "/admin/inco", "/admin/admins", "/admin/programs", `/admin/programs/${fe.id}`, "/admin/profile",
    "/admin/hootarena", "/admin/hootarena/new", `/admin/hootarena/${hoot}`,
  ];
  const publicPages = ["/", "/login", "/admin/login", "/join", "/hootarena", "/inco/status", "/homeworks/new", "/my-homeworks"];

  async function sweep(label, makeContext, paths) {
    for (const [vw, theme] of [[{ width: 1366, height: 860 }, "dark"], [{ width: 360, height: 780 }, "light"]]) {
      await check(`${label}: ${paths.length} pages render cleanly at ${vw.width}px (${theme})`, async () => {
        const context = await makeContext(vw);
        await context.addInitScript((t) => localStorage.setItem("skillarena-theme", t), theme);
        const page = await context.newPage();
        const problems = [];
        page.on("pageerror", (e) => problems.push(`pageerror ${page.url()}: ${e.message}`));
        page.on("console", (m) => { if (m.type() === "error") problems.push(`console ${page.url()}: ${m.text()}`); });
        for (const path of paths) {
          const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
          if (!res || res.status() >= 400) problems.push(`${path} -> HTTP ${res?.status()}`);
          const body = await page.locator("body").innerText();
          if (/something went wrong|application error|internal server error/i.test(body)) problems.push(`${path}: error page`);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          if (overflow > 1) problems.push(`${path}: ${overflow}px horizontal overflow`);
        }
        await context.close();
        await assert(problems.length === 0, problems.join("\n"));
      });
    }
  }

  const studentCtx = async (viewport) => {
    const context = await browser.newContext({ viewport });
    await loginPage("/login", "/dashboard", s1.username, s1.password, context);
    return context;
  };
  const adminCtx = async (viewport) => {
    const context = await browser.newContext({ viewport });
    await loginPage("/admin/login", "/admin", ADMIN_USERNAME, ADMIN_PASSWORD, context);
    return context;
  };
  await sweep("student", studentCtx, studentPages);
  await sweep("admin", adminCtx, adminPages);
  await sweep("public", (viewport) => browser.newContext({ viewport }), publicPages);

  await check("an unknown URL renders the branded 404 page", async () => {
    const page = await (await browser.newContext()).newPage();
    const res = await page.goto(`${BASE}/definitely-not-a-page-${RUN_ID}`, { waitUntil: "networkidle" });
    await assert(res.status() === 404, `expected 404, got ${res.status()}`);
    await page.close();
  });
}

async function cleanup() {
  await prisma.homework.deleteMany({ where: { id: { in: created.homeworks } } });
  await prisma.hootGame.deleteMany({ where: { id: { in: created.hootGames } } });
  await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: "lr-" }, role: "STUDENT" } });
  for (const id of created.programs) {
    await prisma.subject.deleteMany({ where: { programId: id } });
    await prisma.program.deleteMany({ where: { id } });
  }
}

try {
  await run();
} catch (err) {
  fail("launch-readiness e2e crashed", err?.stack || err);
} finally {
  try { await cleanup(); console.log("\nCleaned up launch-readiness fixtures."); } catch (err) { console.log("cleanup failed:", err); }
  try { await browser.close(); } catch {}
  try { await prisma.$disconnect(); } catch {}
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("FAILURES:", failed);
    process.exit(1);
  }
}
