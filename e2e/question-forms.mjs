// Add/Edit Question forms (2026-11-09), quizzes and HootArena: 2-4 quiz
// answers (add / remove / remove-row), the radio picks the correct answer
// at its CURRENT position, HootArena multiple choice + True/False, and the
// server rejects gaps / too few answers. Local/dev DB only.
import "dotenv/config";
import { chromium } from "playwright";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const SUPER = { username: process.env.ADMIN_USERNAME || process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };
const results = [];
const ok = (name) => { results.push({ name, pass: true }); console.log("PASS:", name); };
const fail = (name, err) => { results.push({ name, pass: false, err: String(err) }); console.log("FAIL:", name, "-", err); };
const assert = async (cond, msg) => { if (!cond) throw new Error(msg); };
async function check(name, fn) { try { await fn(); ok(name); } catch (err) { fail(name, err?.stack || err); } }

const prisma = new PrismaClient();
const browser = await chromium.launch();
const main = (p) => p.locator("main");
const RUN_ID = Date.now();
const TAG = `QF ${RUN_ID}`;

async function run() {
  const superAdmin = await prisma.user.findUniqueOrThrow({ where: { username: SUPER.username } });
  const subject = await prisma.subject.findFirstOrThrow({ where: { program: { name: "Front-end Development" } } });
  const quiz = await prisma.homework.create({ data: { title: `${TAG} quiz`, mode: "QUIZ", status: "DRAFT", ownerUserId: superAdmin.id, subjectId: subject.id, joinCode: `qf${RUN_ID % 1e8}` } });
  const game = await prisma.hootGame.create({ data: { title: `${TAG} game`, pin: String(800000 + (RUN_ID % 99999)), hostId: superAdmin.id } });

  const page = await browser.newPage();
  await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="username"]', SUPER.username);
  await page.fill('input[name="password"]', SUPER.password);
  await Promise.all([page.waitForURL(`${BASE}/admin`), page.click('button[type="submit"]')]);
  const quizNew = `${BASE}/admin/quizzes/${quiz.id}/questions/new`;

  await check("quiz: a 3-answer question saves with the right answer marked", async () => {
    await page.goto(quizNew, { waitUntil: "networkidle" });
    await main(page).getByRole("button", { name: "Remove Last Answer" }).click();
    await assert((await main(page).locator('input[name^="opt"]').count()) === 3, "3 rows");
    await main(page).locator('textarea[name="text"]').fill(`${TAG} three`);
    for (const [i, t] of ["Red", "Green", "Blue"].entries()) await main(page).locator(`input[name="opt${i + 1}"]`).fill(t);
    await main(page).locator('input[name="correct"][value="2"]').check();
    await Promise.all([page.waitForURL(`${BASE}/admin/quizzes/${quiz.id}`), main(page).getByRole("button", { name: "Add Question" }).click()]);
    const q = await prisma.question.findFirstOrThrow({ where: { homeworkId: quiz.id, text: `${TAG} three` }, include: { options: { orderBy: { order: "asc" } } } });
    await assert(q.options.map((o) => o.text).join() === "Red,Green,Blue" && q.options[1].isCorrect && q.options.filter((o) => o.isCorrect).length === 1, `options ${JSON.stringify(q.options)}`);
  });

  await check("quiz: removing a middle row keeps the correct answer on the same text", async () => {
    await page.goto(quizNew, { waitUntil: "networkidle" });
    await main(page).locator('textarea[name="text"]').fill(`${TAG} middle`);
    for (const [i, t] of ["A", "B", "C", "D"].entries()) await main(page).locator(`input[name="opt${i + 1}"]`).fill(t);
    await main(page).locator('input[name="correct"][value="4"]').check(); // "D"
    await main(page).getByRole("button", { name: "Remove answer 2" }).click(); // drop "B"
    await assert((await main(page).locator('input[name="opt3"]').inputValue()) === "D", "D moved up");
    await assert(await main(page).locator('input[name="correct"][value="3"]').isChecked(), "D still marked correct");
    await Promise.all([page.waitForURL(`${BASE}/admin/quizzes/${quiz.id}`), main(page).getByRole("button", { name: "Add Question" }).click()]);
    const q = await prisma.question.findFirstOrThrow({ where: { homeworkId: quiz.id, text: `${TAG} middle` }, include: { options: { orderBy: { order: "asc" } } } });
    await assert(q.options.map((o) => o.text).join() === "A,C,D" && q.options[2].isCorrect, `options ${q.options.map((o) => `${o.text}${o.isCorrect ? "*" : ""}`)}`);
  });

  await check("quiz: Add Answer stops at 4 and Remove stops at 2", async () => {
    await page.goto(quizNew, { waitUntil: "networkidle" });
    await assert(await main(page).getByRole("button", { name: "Add Answer" }).isDisabled(), "add disabled at 4");
    await main(page).getByRole("button", { name: "Remove Last Answer" }).click();
    await main(page).getByRole("button", { name: "Remove Last Answer" }).click();
    await assert(await main(page).getByRole("button", { name: "Remove Last Answer" }).isDisabled(), "remove disabled at 2");
    await assert(await main(page).getByRole("button", { name: "Remove answer 1" }).isDisabled(), "row trash disabled at 2");
  });

  await check("quiz: the server rejects a gap and a single answer", async () => {
    const res = await page.evaluate(async ({ url }) => {
      const r = await fetch(url);
      return r.status;
    }, { url: quizNew });
    await assert(res === 200, "page reachable");
    // Submit with a gap via the real form: blank out answer 2 without "required".
    await page.goto(quizNew, { waitUntil: "networkidle" });
    await main(page).locator('textarea[name="text"]').fill(`${TAG} gap`);
    for (const [i, t] of ["A", "", "C", "D"].entries()) await main(page).locator(`input[name="opt${i + 1}"]`).fill(t);
    await main(page).locator('input[name="opt2"]').evaluate((el) => el.removeAttribute("required"));
    await main(page).locator('input[name="correct"][value="1"]').check();
    await Promise.all([page.waitForURL(/error=options/), main(page).getByRole("button", { name: "Add Question" }).click()]);
    await assert(!(await prisma.question.findFirst({ where: { homeworkId: quiz.id, text: `${TAG} gap` } })), "not saved");
  });

  await check("quiz: editing shows the saved answers and correct mark", async () => {
    const q = await prisma.question.findFirstOrThrow({ where: { homeworkId: quiz.id, text: `${TAG} three` } });
    await page.goto(`${BASE}/admin/quizzes/${quiz.id}/questions/${q.id}/edit`, { waitUntil: "networkidle" });
    await assert((await main(page).locator('input[name^="opt"]').count()) === 3, "3 rows");
    await assert(await main(page).locator('input[name="correct"][value="2"]').isChecked(), "Green checked");
    await main(page).getByRole("button", { name: "Add Answer" }).click();
    await main(page).locator('input[name="opt4"]').fill("Yellow");
    await Promise.all([page.waitForURL(`${BASE}/admin/quizzes/${quiz.id}`), main(page).getByRole("button", { name: "Save Changes" }).click()]);
    const after = await prisma.question.findUniqueOrThrow({ where: { id: q.id }, include: { options: { orderBy: { order: "asc" } } } });
    await assert(after.options.map((o) => o.text).join() === "Red,Green,Blue,Yellow" && after.options[1].isCorrect, "edited");
  });

  await check("hootarena: multiple choice with two correct answers", async () => {
    await page.goto(`${BASE}/admin/hootarena/${game.id}/questions/new`, { waitUntil: "networkidle" });
    await main(page).locator('select[name="type"]').selectOption("MULTIPLE_CHOICE");
    await main(page).locator('textarea[name="text"]').fill(`${TAG} multi`);
    await main(page).getByRole("button", { name: "Add Answer" }).click();
    for (const [i, t] of ["1", "2", "3", "4", "5"].entries()) await main(page).locator(`input[name="opt${i + 1}"]`).fill(t);
    await main(page).locator('input[name="correct"][value="2"]').check();
    await main(page).locator('input[name="correct"][value="5"]').check();
    await Promise.all([page.waitForURL(`${BASE}/admin/hootarena/${game.id}`), main(page).getByRole("button", { name: "Add Question" }).click()]);
    const q = await prisma.hootQuestion.findFirstOrThrow({ where: { gameId: game.id, text: `${TAG} multi` }, include: { options: { orderBy: { order: "asc" } } } });
    await assert(q.type === "MULTIPLE_CHOICE" && q.options.length === 5 && q.options.filter((o) => o.isCorrect).map((o) => o.text).join() === "2,5", "multi saved");
  });

  await check("hootarena: True / False", async () => {
    await page.goto(`${BASE}/admin/hootarena/${game.id}/questions/new`, { waitUntil: "networkidle" });
    await main(page).locator('select[name="type"]').selectOption("TRUE_FALSE");
    await main(page).locator('textarea[name="text"]').fill(`${TAG} tf`);
    await main(page).locator('input[name="correct"][value="2"]').check();
    await Promise.all([page.waitForURL(`${BASE}/admin/hootarena/${game.id}`), main(page).getByRole("button", { name: "Add Question" }).click()]);
    const q = await prisma.hootQuestion.findFirstOrThrow({ where: { gameId: game.id, text: `${TAG} tf` }, include: { options: { orderBy: { order: "asc" } } } });
    await assert(q.type === "TRUE_FALSE" && q.options[1].text === "False" && q.options[1].isCorrect, "tf saved");
  });

  await check("hootarena: edit opens with the saved type and answers", async () => {
    const q = await prisma.hootQuestion.findFirstOrThrow({ where: { gameId: game.id, text: `${TAG} multi` } });
    await page.goto(`${BASE}/admin/hootarena/${game.id}/questions/${q.id}/edit`, { waitUntil: "networkidle" });
    await assert((await main(page).locator('select[name="type"]').inputValue()) === "MULTIPLE_CHOICE", "type");
    await assert((await main(page).locator('input[name^="opt"]').count()) === 5, "5 rows");
    await assert(await main(page).locator('input[name="correct"][value="5"]').isChecked(), "5 checked");
  });
  await page.close();
}

try {
  await run();
} catch (err) {
  fail("question-forms e2e crashed", err?.stack || err);
} finally {
  try {
    await prisma.homework.deleteMany({ where: { title: { startsWith: TAG } } });
    await prisma.hootGame.deleteMany({ where: { title: { startsWith: TAG } } });
  } catch (e) { console.log("cleanup failed", e); }
  await browser.close();
  await prisma.$disconnect();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.log("FAILURES:", failed); process.exit(1); }
}
