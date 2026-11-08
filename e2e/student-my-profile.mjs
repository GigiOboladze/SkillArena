// Student "My Profile" (2026-11-08): stats (completed / assigned, pending,
// points), hobbies the student adds/removes themselves (shared with the
// admin's hobby field), name edit, username/password behind their buttons.
//
// Creates and deletes its own RUN_ID-suffixed rows; safe against a local/dev
// database only.
import "dotenv/config";
import { chromium } from "playwright";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { hashPassword } from "../src/lib/password.ts";

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const results = [];
const ok = (name) => { results.push({ name, pass: true }); console.log("PASS:", name); };
const fail = (name, err) => { results.push({ name, pass: false, err: String(err) }); console.log("FAIL:", name, "-", err); };
const assert = async (cond, msg) => { if (!cond) throw new Error(msg); };
async function check(name, fn) { try { await fn(); ok(name); } catch (err) { fail(name, err?.stack || err); } }

const prisma = new PrismaClient();
const browser = await chromium.launch();
const main = (p) => p.locator("main");
const RUN_ID = Date.now();
const username = `e2e-myprof-${RUN_ID}`;
const PASSWORD = "e2e-myprof-pass-123";
const PROFILE = `${BASE}/dashboard/profile`;

async function submitAction(page, locator, marker) {
  await Promise.all([page.waitForURL((u) => u.search.includes(marker)), locator.click()]);
  await page.waitForLoadState("networkidle");
}

async function run() {
  const fe = await prisma.program.findFirstOrThrow({ where: { name: "Front-end Development" } });
  await prisma.user.create({
    data: { username, firstName: "Myprof", lastName: "Student", passwordHash: await hashPassword(PASSWORD), role: "STUDENT", programId: fe.id, hobby: "Gaming, Music" },
  });
  const page = await browser.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([page.waitForURL(`${BASE}/dashboard`), page.click('button[type="submit"]')]);

  await check("My Profile shows name, program, stats and the hobby chips", async () => {
    await page.goto(PROFILE, { waitUntil: "networkidle" });
    const text = await main(page).innerText();
    for (const s of ["My Profile", "Myprof Student", "Front-end Development", "Completed Quizzes", "Pending Quizzes", "Total Points", "Student PETs", "Hobbies", "Personal Information", "Account Settings"]) {
      await assert(text.includes(s), `missing "${s}"`);
    }
    const chips = await main(page).locator("li.sa-mp-hobby").allInnerTexts();
    await assert(chips.map((c) => c.trim()).join("|") === "Gaming|Music", `chips: ${chips}`);
    await assert(/0 \/ \d+/.test(text), "completed / assigned");
  });

  await check("a student adds a hobby by typing it and from a suggestion", async () => {
    await main(page).locator("summary", { hasText: "Add Hobby" }).click();
    await main(page).getByLabel("New hobby").fill("  Chess  ");
    await submitAction(page, main(page).getByRole("button", { name: "Add", exact: true }), "updated=hobby");
    await page.goto(PROFILE, { waitUntil: "networkidle" });
    await main(page).locator("summary", { hasText: "Add Hobby" }).click();
    await submitAction(page, main(page).getByRole("button", { name: "+ Travel" }), "updated=hobby");
    const row = await prisma.user.findUniqueOrThrow({ where: { username } });
    await assert(row.hobby === "Gaming, Music, Chess, Travel", `hobby: ${row.hobby}`);
  });

  await check("adding a hobby that's already there doesn't duplicate it", async () => {
    await page.goto(PROFILE, { waitUntil: "networkidle" });
    await main(page).locator("summary", { hasText: "Add Hobby" }).click();
    await main(page).getByLabel("New hobby").fill("gaming");
    await submitAction(page, main(page).getByRole("button", { name: "Add", exact: true }), "updated=hobby");
    const row = await prisma.user.findUniqueOrThrow({ where: { username } });
    await assert(row.hobby === "Gaming, Music, Chess, Travel", `hobby: ${row.hobby}`);
  });

  await check("Manage Hobbies lets the student remove one", async () => {
    await Promise.all([page.waitForURL(/hobbies=manage/), main(page).getByRole("link", { name: /Manage Hobbies/ }).click()]);
    await main(page).getByRole("button", { name: "Remove Music" }).click();
    await main(page).getByRole("button", { name: "Remove Music" }).waitFor({ state: "detached" });
    const row = await prisma.user.findUniqueOrThrow({ where: { username } });
    await assert(row.hobby === "Gaming, Chess, Travel", `hobby: ${row.hobby}`);
  });

  await check("a student edits their first and last name (blank is rejected)", async () => {
    await page.goto(PROFILE, { waitUntil: "networkidle" });
    await main(page).locator("summary", { hasText: "Edit" }).click();
    await main(page).locator('input[name="firstName"]').fill("Renamed");
    await main(page).locator('input[name="lastName"]').fill("Person");
    await submitAction(page, main(page).getByRole("button", { name: "Save name" }), "updated=name");
    let row = await prisma.user.findUniqueOrThrow({ where: { username } });
    await assert(row.firstName === "Renamed" && row.lastName === "Person", "name saved");
    await assert((await page.locator("aside, nav").first().innerText()).includes("Renamed Person") || (await main(page).innerText()).includes("Renamed Person"), "name shown");
    // Bypass the browser's `required` to prove the server check.
    await main(page).locator("summary", { hasText: "Edit" }).click();
    await main(page).locator('input[name="firstName"]').evaluate((el) => { el.removeAttribute("required"); el.value = "   "; });
    await submitAction(page, main(page).getByRole("button", { name: "Save name" }), "error=name");
    row = await prisma.user.findUniqueOrThrow({ where: { username } });
    await assert(row.firstName === "Renamed", "blank rejected");
    await assert(await main(page).locator('input[name="firstName"]').isVisible(), "edit form re-opens on error");
  });

  await check("the admin sees the student's hobbies", async () => {
    const row = await prisma.user.findUniqueOrThrow({ where: { username } });
    await assert(row.hobby === "Gaming, Chess, Travel", `shared field: ${row.hobby}`);
  });

  await page.close();
}

try {
  await run();
} catch (err) {
  fail("student-my-profile e2e crashed", err?.stack || err);
} finally {
  try { await prisma.user.deleteMany({ where: { username } }); } catch (e) { console.log("cleanup failed", e); }
  await browser.close();
  await prisma.$disconnect();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.log("FAILURES:", failed); process.exit(1); }
}
