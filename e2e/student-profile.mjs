// Student profiles (2026-11-08): the Create Student page, optional hobby /
// communication skill, the profile page's motivation status and the
// admin-only activity log (comments, progress, issues, images), plus the
// students list (cards, search, sort, pagination) and program isolation.
//
// Creates and deletes its own RUN_ID-suffixed rows; safe against a local/dev
// database only.
import "dotenv/config";
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const SUPER = { username: process.env.ADMIN_USERNAME || process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };
const NETWORKS_ADMIN = { username: "e2e-net-admin", password: "e2e-net-pass-123456" };

const results = [];
const ok = (name) => { results.push({ name, pass: true }); console.log("PASS:", name); };
const fail = (name, err) => { results.push({ name, pass: false, err: String(err) }); console.log("FAIL:", name, "-", err); };
const assert = async (cond, msg) => { if (!cond) throw new Error(msg); };
async function check(name, fn) { try { await fn(); ok(name); } catch (err) { fail(name, err?.stack || err); } }

const prisma = new PrismaClient();
const browser = await chromium.launch();
const main = (p) => p.locator("main");
const RUN_ID = Date.now();
const createdUsernames = [];

async function adminLogin({ username, password }) {
  const page = await browser.newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL(`${BASE}/admin`), page.click('button[type="submit"]')]);
  await page.locator('[aria-busy="true"]').waitFor({ state: "detached" });
  return page;
}
/** Clicks a submit button and waits for the action's redirect to land (URL gains `marker`). */
async function submitAction(page, locator, marker) {
  await Promise.all([page.waitForURL((u) => u.search.includes(marker)), locator.click()]);
  await page.waitForLoadState("networkidle");
}

async function run() {
  const admin = await adminLogin(SUPER);
  const fe = await prisma.program.findFirstOrThrow({ where: { name: "Front-end Development" } });

  const fullUser = `e2e-prof-full-${RUN_ID}`;
  const bareUser = `e2e-prof-bare-${RUN_ID}`;
  createdUsernames.push(fullUser, bareUser);

  await check("the list's Create student button opens the Create Student page", async () => {
    await admin.goto(`${BASE}/admin/students`, { waitUntil: "networkidle" });
    await Promise.all([admin.waitForURL(/\/admin\/students\/new/), main(admin).getByRole("link", { name: "Create student" }).click()]);
    await assert((await main(admin).innerText()).includes("Create Student"), "Create Student heading");
  });

  await check("create a student with hobby, communication stars and a JavaScript group", async () => {
    await admin.goto(`${BASE}/admin/students/new?program=${fe.id}`, { waitUntil: "networkidle" });
    await main(admin).locator('input[name="firstName"]').fill("Prof");
    await main(admin).locator('input[name="lastName"]').fill("Full");
    await main(admin).locator('input[name="username"]').fill(fullUser);
    await main(admin).locator('input[name="password"]').fill("pass-123456");
    await main(admin).locator('input[name="hobby"]').fill("Basketball");
    await main(admin).getByRole("button", { name: "4 stars" }).click();
    await main(admin).getByRole("radiogroup", { name: "JavaScript group" }).getByRole("radio", { name: "II", exact: true }).check();
    await Promise.all([
      admin.waitForURL((u) => u.searchParams.get("created") === fullUser),
      main(admin).getByRole("button", { name: "Create student" }).click(),
    ]);
    const row = await prisma.user.findUniqueOrThrow({ where: { username: fullUser }, include: { subjectGroups: { include: { subject: true, group: true } } } });
    await assert(row.hobby === "Basketball" && row.communicationSkill === 4, `profile fields: ${row.hobby} / ${row.communicationSkill}`);
    const js = row.subjectGroups.find((sg) => sg.subject.name === "JavaScript");
    await assert(js?.group?.name === "Group II", "JavaScript should be Group II");
    await assert((await main(admin).innerText()).includes("Credentials for"), "credentials banner");
  });

  await check("hobby and communication skill are optional when creating a student", async () => {
    await admin.goto(`${BASE}/admin/students/new?program=${fe.id}`, { waitUntil: "networkidle" });
    await main(admin).locator('input[name="firstName"]').fill("Prof");
    await main(admin).locator('input[name="lastName"]').fill("Bare");
    await main(admin).locator('input[name="username"]').fill(bareUser);
    await Promise.all([
      admin.waitForURL((u) => u.searchParams.get("created") === bareUser),
      main(admin).getByRole("button", { name: "Create student" }).click(),
    ]);
    const row = await prisma.user.findUniqueOrThrow({ where: { username: bareUser } });
    await assert(row.hobby === null && row.communicationSkill === null && row.motivation === null, "optional fields stay empty");
  });

  const student = await prisma.user.findUniqueOrThrow({ where: { username: fullUser } });
  const profileUrl = `${BASE}/admin/students/${student.id}`;

  await check("the list shows the student as a card with hobby, and clicking it opens the profile", async () => {
    await admin.goto(`${BASE}/admin/students?q=${fullUser}`, { waitUntil: "networkidle" });
    const card = main(admin).locator("li", { hasText: `@${fullUser}` });
    await assert((await card.innerText()).includes("Basketball"), "hobby chip");
    await Promise.all([admin.waitForURL(profileUrl), card.locator("a").first().click()]);
  });

  await check("motivation 82% shows 'Going well' and is written to the activity log", async () => {
    await admin.goto(profileUrl, { waitUntil: "networkidle" });
    await main(admin).locator('summary[aria-label="Update motivation"]').click();
    await main(admin).locator('input[name="motivation"]').fill("82");
    await main(admin).locator('textarea[name="note"]').fill("Consistent progress");
    await submitAction(admin, main(admin).getByRole("button", { name: "Save motivation" }), "saved=motivation");
    const text = await main(admin).innerText();
    await assert(text.includes("82%") && text.includes("Going well"), "status pill");
    const note = await prisma.studentNote.findFirstOrThrow({ where: { studentId: student.id, kind: "MOTIVATION" } });
    await assert(note.motivationTo === 82 && note.body.includes("Consistent progress"), `note: ${note.body}`);
  });

  await check("motivation bands: 50% is Medium, 20% is Needs attention", async () => {
    for (const [value, label] of [["50", "Medium"], ["20", "Needs attention"]]) {
      await admin.goto(profileUrl, { waitUntil: "networkidle" });
      await main(admin).locator('summary[aria-label="Update motivation"]').click();
      await main(admin).locator('input[name="motivation"]').fill(value);
      await submitAction(admin, main(admin).getByRole("button", { name: "Save motivation" }), "saved=motivation");
      await assert((await main(admin).innerText()).includes(label), `${value}% should read ${label}`);
    }
    const row = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
    await assert(row.motivation === 20, "stored motivation");
  });

  await check("an admin adds an issue with an image; it shows in the log with the Lecturer tag", async () => {
    await admin.goto(profileUrl, { waitUntil: "networkidle" });
    await main(admin).locator('textarea[name="body"]').fill(`Missed two deadlines ${RUN_ID}`);
    await main(admin).locator('select[name="kind"]').selectOption("ISSUE");
    await main(admin).locator('select[name="as"]').last().selectOption("Lecturer");
    await main(admin).locator('input[name="images"]').setInputFiles(path.join(__dirname, "fixtures", "test-image.png"));
    await submitAction(admin, main(admin).getByRole("button", { name: "Add update" }), "saved=note");
    const text = await main(admin).innerText();
    await assert(text.includes("Issue reported") && text.includes(`Missed two deadlines ${RUN_ID}`) && text.includes("Lecturer"), "issue entry");
    const note = await prisma.studentNote.findFirstOrThrow({ where: { studentId: student.id, kind: "ISSUE" }, include: { attachments: true } });
    await assert(note.attachments.length === 1 && note.attachments[0].contentType === "image/png", "attachment stored");
    const img = await admin.request.get(`${BASE}/admin/student-files/${note.attachments[0].id}`);
    await assert(img.status() === 200 && img.headers()["content-type"] === "image/png", "image served to admin");
  });

  await check("a non-image file is rejected with a clear message", async () => {
    await admin.goto(profileUrl, { waitUntil: "networkidle" });
    await main(admin).locator('textarea[name="body"]').fill("Bad file");
    await main(admin).locator('input[name="images"]').setInputFiles(path.join(__dirname, "fixtures", "not-an-image.png"));
    await submitAction(admin, main(admin).getByRole("button", { name: "Add update" }), "error=filetype");
    await assert((await main(admin).innerText()).includes("Only PNG, JPEG, GIF or WebP"), "filetype error");
    await assert((await prisma.studentNote.count({ where: { studentId: student.id, body: "Bad file" } })) === 0, "no note saved");
  });

  await check("hobby and communication can be changed later from the profile", async () => {
    await admin.goto(profileUrl, { waitUntil: "networkidle" });
    await main(admin).locator("summary", { hasText: "Edit" }).click();
    await main(admin).locator('form input[name="hobby"]').fill("Music");
    await main(admin).getByRole("button", { name: "5 stars" }).click();
    await submitAction(admin, main(admin).getByRole("button", { name: "Save", exact: true }), "saved=profile");
    const row = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
    await assert(row.hobby === "Music" && row.communicationSkill === 5, `${row.hobby} / ${row.communicationSkill}`);
  });

  await check("Progress and Quizzes tabs render", async () => {
    for (const tab of ["progress", "quizzes"]) {
      const res = await admin.goto(`${profileUrl}?tab=${tab}`, { waitUntil: "networkidle" });
      await assert(res.status() === 200, `${tab} tab status`);
      await assert(!/application error/i.test(await admin.locator("body").innerText()), `${tab} tab error`);
    }
  });

  await check("another program's admin can't open the profile or its images", async () => {
    const net = await adminLogin(NETWORKS_ADMIN);
    await net.goto(profileUrl, { waitUntil: "networkidle" });
    await assert((await net.locator("body").innerText()).includes("Not found"), "profile must 404");
    const att = await prisma.studentNoteAttachment.findFirstOrThrow({ where: { note: { studentId: student.id } } });
    const img = await net.request.get(`${BASE}/admin/student-files/${att.id}`);
    await assert(img.status() === 404, `image must 404, got ${img.status()}`);
    await net.close();
  });

  await check("the author can delete a log entry", async () => {
    await admin.goto(profileUrl, { waitUntil: "networkidle" });
    const before = await prisma.studentNote.count({ where: { studentId: student.id } });
    await Promise.all([
      admin.waitForResponse((r) => r.request().method() === "POST"),
      main(admin).locator(".sa-timeline").getByRole("button", { name: "Delete" }).first().click(),
    ]);
    await admin.waitForTimeout(800);
    await assert((await prisma.studentNote.count({ where: { studentId: student.id } })) === before - 1, "one entry fewer");
  });

  await check("students list paginates 12 per page and keeps filters in page links", async () => {
    const extra = Array.from({ length: 13 }, (_, i) => `e2e-prof-page-${i}-${RUN_ID}`);
    createdUsernames.push(...extra);
    await prisma.user.createMany({
      data: extra.map((u) => ({ firstName: "Page", lastName: "Tester", username: u, passwordHash: "x", role: "STUDENT", programId: fe.id })),
    });
    await admin.goto(`${BASE}/admin/students?q=e2e-prof-page-&sort=name`, { waitUntil: "networkidle" });
    await assert((await main(admin).locator("li.sa-st-card").count()) === 12, "12 cards on page 1");
    await Promise.all([admin.waitForURL(/page=2/), main(admin).getByRole("link", { name: "2", exact: true }).click()]);
    await assert(admin.url().includes("q=e2e-prof-page-") && admin.url().includes("sort=name"), "filters kept");
    await assert((await main(admin).locator("li.sa-st-card").count()) === 1, "1 card on page 2");
  });

  await admin.close();
}

try {
  await run();
} catch (err) {
  fail("student-profile e2e crashed", err?.stack || err);
} finally {
  try { await prisma.user.deleteMany({ where: { username: { in: createdUsernames } } }); } catch (e) { console.log("cleanup failed", e); }
  await browser.close();
  await prisma.$disconnect();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.log("FAILURES:", failed); process.exit(1); }
}
