// Student dashboard (2026-11-08): the Class Schedule card (admin editor on
// the student's profile -> student dashboard, This Week / Today / Tomorrow)
// and the rotating Cool News card (4 s per item, looping) + /dashboard/news.
//
// Creates and deletes its own RUN_ID-suffixed rows; safe against a local/dev
// database only.
import "dotenv/config";
import { chromium } from "playwright";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { hashPassword } from "../src/lib/password.ts";

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
const createdUsernames = [];
const PASSWORD = "e2e-sched-pass-123";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const todayIso = DAYS.indexOf(new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Asia/Tbilisi" }).format(new Date())) + 1;
const tomorrowIso = (todayIso % 7) + 1;
const otherIso = (tomorrowIso % 7) + 1; // neither today nor tomorrow

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
async function studentLogin(username) {
  const page = await browser.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([page.waitForURL(`${BASE}/dashboard`), page.click('button[type="submit"]')]);
  await page.waitForLoadState("networkidle");
  return page;
}
async function submitAction(page, locator, marker) {
  await Promise.all([page.waitForURL((u) => u.search.includes(marker)), locator.click()]);
  await page.waitForLoadState("networkidle");
}

async function run() {
  const fe = await prisma.program.findFirstOrThrow({ where: { name: "Front-end Development" } });
  const withUser = `e2e-sched-${RUN_ID}`;
  const emptyUser = `e2e-sched-empty-${RUN_ID}`;
  createdUsernames.push(withUser, emptyUser);
  const passwordHash = await hashPassword(PASSWORD);
  await prisma.user.createMany({
    data: [
      { username: withUser, firstName: "Sched", lastName: "Student", passwordHash, role: "STUDENT", programId: fe.id },
      { username: emptyUser, firstName: "Empty", lastName: "Student", passwordHash, role: "STUDENT", programId: fe.id },
    ],
  });
  const student = await prisma.user.findUniqueOrThrow({ where: { username: withUser } });

  const admin = await adminLogin(SUPER);
  const scheduleUrl = `${BASE}/admin/students/${student.id}?tab=schedule`;

  await check("admin adds a class on the student's Schedule tab", async () => {
    await admin.goto(scheduleUrl, { waitUntil: "networkidle" });
    const form = admin.locator("form.sa-schf-add");
    await form.locator('input[name="title"]').fill("HTML/CSS");
    await form.locator('input[name="room"]').fill("N303 Auditory");
    await form.locator(`input[name="days"][value="${todayIso}"]`).check();
    await form.locator(`input[name="days"][value="${otherIso}"]`).check();
    await form.locator('input[name="startTime"]').fill("18:00");
    await form.locator('input[name="endTime"]').fill("21:00");
    await form.locator('input[name="tone"][value="teal"]').check();
    await form.locator('input[name="icon"][value="code"]').check();
    await submitAction(admin, form.getByRole("button", { name: "Add class" }), "saved=schedule");
    const rows = await prisma.scheduleEntry.findMany({ where: { studentId: student.id } });
    await assert(rows.length === 1, `one row, got ${rows.length}`);
    const r = rows[0];
    await assert(r.title === "HTML/CSS" && r.room === "N303 Auditory" && r.startTime === "18:00" && r.endTime === "21:00", "fields saved");
    await assert(r.tone === "teal" && r.icon === "code", "tone/icon saved");
    await assert(JSON.stringify(r.days) === JSON.stringify([todayIso, otherIso].sort((a, b) => a - b)), `days saved ${r.days}`);
    await assert((await main(admin).innerText()).includes("Schedule saved."), "notice");
  });

  await check("a class without any day is rejected", async () => {
    await admin.goto(scheduleUrl, { waitUntil: "networkidle" });
    const form = admin.locator("form.sa-schf-add");
    await form.locator('input[name="title"]').fill("No days");
    await form.locator('input[name="startTime"]').fill("10:00");
    await form.locator('input[name="endTime"]').fill("11:00");
    await submitAction(admin, form.getByRole("button", { name: "Add class" }), "error=schedule");
    await assert((await prisma.scheduleEntry.count({ where: { studentId: student.id } })) === 1, "nothing added");
  });

  await check("admin edits a class", async () => {
    await admin.goto(scheduleUrl, { waitUntil: "networkidle" });
    await main(admin).locator("summary[aria-label='Edit HTML/CSS']").click();
    const form = main(admin).locator("form").filter({ has: admin.getByRole("button", { name: "Save class" }) });
    await form.locator('input[name="room"]').fill("Online");
    await form.locator(`input[name="days"][value="${tomorrowIso}"]`).check();
    await submitAction(admin, form.getByRole("button", { name: "Save class" }), "saved=schedule");
    const r = await prisma.scheduleEntry.findFirstOrThrow({ where: { studentId: student.id } });
    await assert(r.room === "Online" && r.days.includes(tomorrowIso) && r.days.length === 3, `edited: ${r.room} ${r.days}`);
  });

  // A second class only on the "other" day, to test the Today/Tomorrow filters.
  await prisma.scheduleEntry.create({
    data: { studentId: student.id, title: "Git", days: [otherIso], startTime: "15:00", endTime: "18:00", room: "N303 Auditory", tone: "amber", icon: "git", sortOrder: 1 },
  });

  const sp = await studentLogin(withUser);

  await check("student dashboard shows the Class Schedule with days, time and room", async () => {
    const card = main(sp).locator("section.sa-sched");
    const text = await card.innerText();
    await assert(text.includes("Class Schedule") && text.includes("This Week"), "header");
    const rows = card.locator("li.sa-sched-row");
    await assert((await rows.count()) === 2, `2 rows, got ${await rows.count()}`);
    const first = await rows.nth(0).innerText();
    const expectDays = [todayIso, tomorrowIso, otherIso].sort((a, b) => a - b).map((d) => DAYS[d - 1]).join(", ");
    await assert(first.includes("HTML/CSS") && first.includes(expectDays) && first.includes("18:00") && first.includes("21:00") && first.includes("Online"), `row: ${first}`);
    await assert(await rows.nth(0).evaluate((el) => el.classList.contains("is-teal")), "tone class");
  });

  await check("Today / Tomorrow filter the schedule by the school's weekday", async () => {
    await sp.locator("details.sa-sched-pick > summary").click();
    await Promise.all([sp.waitForURL(/schedule=today/), sp.getByRole("menuitem", { name: "Today" }).click()]);
    await sp.waitForLoadState("networkidle");
    let titles = await main(sp).locator("li.sa-sched-row .sa-sched-title").allInnerTexts();
    await assert(titles.length === 1 && titles[0] === "HTML/CSS", `today: ${titles}`);
    await assert((await main(sp).locator("details.sa-sched-pick > summary").innerText()).includes("Today"), "label shows Today");
    await sp.goto(`${BASE}/dashboard?schedule=tomorrow`, { waitUntil: "networkidle" });
    titles = await main(sp).locator("li.sa-sched-row .sa-sched-title").allInnerTexts();
    await assert(titles.length === 1 && titles[0] === "HTML/CSS", `tomorrow: ${titles}`);
    await sp.goto(`${BASE}/dashboard?schedule=bogus`, { waitUntil: "networkidle" });
    await assert((await main(sp).locator("li.sa-sched-row").count()) === 2, "unknown view falls back to the week");
  });

  await check("Cool News rotates every 4 seconds and loops", async () => {
    await sp.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    const slides = main(sp).locator(".sa-news-slide");
    await assert((await slides.count()) === 2, "two news items");
    const active = () => slides.evaluateAll((els) => els.findIndex((e) => e.classList.contains("is-active")));
    await assert((await active()) === 0, "starts on the first");
    await sp.waitForTimeout(2500);
    await assert((await active()) === 0, "still first after 2.5 s");
    await sp.waitForTimeout(2300);
    await assert((await active()) === 1, "second after ~4 s");
    await sp.waitForTimeout(4000);
    await assert((await active()) === 0, "back to the first (loop)");
    await main(sp).getByRole("button", { name: "Show news 2" }).click();
    await assert((await active()) === 1, "dot jumps to an item");
    const imgs = await slides.locator("img.sa-news-img").evaluateAll((els) => els.map((e) => e.complete && e.naturalWidth > 0));
    await sp.waitForTimeout(300);
    await assert(imgs.every(Boolean) || (await slides.locator("img.sa-news-img").first().evaluate((e) => e.naturalWidth > 0)), "images load");
  });

  await check("View all news opens /dashboard/news with every item", async () => {
    await Promise.all([sp.waitForURL(/\/dashboard\/news$/), main(sp).getByRole("link", { name: /View all news/ }).click()]);
    await main(sp).locator(".sa-news-list > li").nth(1).waitFor();
    await sp.waitForLoadState("networkidle");
    await assert((await main(sp).locator(".sa-news-list > li").count()) === 2, "two news cards");
    const broken = await main(sp).locator("img.sa-news-img").evaluateAll((els) => els.filter((e) => !(e.naturalWidth > 0)).length);
    await assert(broken === 0, "all images loaded");
  });
  await sp.close();

  await check("a student without a schedule sees the empty state", async () => {
    const ep = await studentLogin(emptyUser);
    const text = await main(ep).locator("section.sa-sched").innerText();
    await assert(text.includes("hasn't been added yet"), `empty state: ${text}`);
    await ep.close();
  });

  await check("admin removes a class", async () => {
    await admin.goto(scheduleUrl, { waitUntil: "networkidle" });
    await submitAction(admin, main(admin).getByRole("button", { name: "Remove Git" }), "saved=scheduledeleted");
    const left = await prisma.scheduleEntry.findMany({ where: { studentId: student.id } });
    await assert(left.length === 1 && left[0].title === "HTML/CSS", "Git removed");
  });

  await check("another program's admin cannot open the student's schedule", async () => {
    const net = await adminLogin({ username: "e2e-net-admin", password: "e2e-net-pass-123456" });
    await net.goto(scheduleUrl, { waitUntil: "networkidle" });
    const text = await net.locator("body").innerText();
    await assert(text.includes("Not found") && !text.includes("Add a class"), "Networks admin must be 404'd");
    await net.close();
  });

  await admin.close();
}

try {
  await run();
} catch (err) {
  fail("dashboard-schedule-news e2e crashed", err?.stack || err);
} finally {
  try { await prisma.user.deleteMany({ where: { username: { in: createdUsernames } } }); } catch (e) { console.log("cleanup failed", e); }
  await browser.close();
  await prisma.$disconnect();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.log("FAILURES:", failed); process.exit(1); }
}
