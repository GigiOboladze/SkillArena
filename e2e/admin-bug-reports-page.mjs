// Admin Bug Reports page (2026-11-09): stat cards, search, status/priority
// filters, admin "Report a Bug" (with validation), priority on the detail
// page. Creates and deletes its own RUN_ID-tagged rows; local/dev DB only.
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
const TAG = `brp-${RUN_ID}`;
const LIST = `${BASE}/admin/bug-reports`;

async function run() {
  const page = await browser.newPage();
  await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="username"]', SUPER.username);
  await page.fill('input[name="password"]', SUPER.password);
  await Promise.all([page.waitForURL(`${BASE}/admin`), page.click('button[type="submit"]')]);
  const superAdmin = await prisma.user.findUniqueOrThrow({ where: { username: SUPER.username } });

  await check("Report a Bug opens the form; an empty description is rejected by the server", async () => {
    await page.goto(LIST, { waitUntil: "networkidle" });
    await Promise.all([page.waitForURL(/\/admin\/bug-reports\/new$/), main(page).getByRole("link", { name: "Report a Bug" }).click()]);
    await main(page).locator('textarea[name="description"]').evaluate((el) => { el.removeAttribute("required"); el.value = "   "; });
    await Promise.all([page.waitForURL(/error=description/), main(page).getByRole("button", { name: "Submit Report" }).click()]);
    await assert((await main(page).innerText()).includes("Describe the bug"), "error shown");
  });

  await check("an admin files a HIGH priority report and it appears in the list", async () => {
    await page.goto(`${BASE}/admin/bug-reports/new`, { waitUntil: "networkidle" });
    await main(page).locator('textarea[name="description"]').fill(`Leaderboard freezes ${TAG}`);
    await main(page).locator('select[name="priority"]').selectOption("HIGH");
    await Promise.all([page.waitForURL(/submitted=1/), main(page).getByRole("button", { name: "Submit Report" }).click()]);
    const r = await prisma.bugReport.findFirstOrThrow({ where: { description: { contains: TAG } } });
    await assert(r.priority === "HIGH" && r.status === "OPEN" && r.studentId === superAdmin.id, `row: ${r.priority}/${r.status}`);
    const row = main(page).locator("li.sa-br-row", { hasText: TAG });
    const text = await row.innerText();
    await assert(text.includes("Open") && text.includes("High priority") && text.includes("Admin"), `row text: ${text}`);
  });

  // A second, LOW priority report to test filters.
  await prisma.bugReport.create({ data: { studentId: superAdmin.id, description: `Typo on login ${TAG}`, priority: "LOW", status: "RESOLVED" } });

  await check("search narrows the list", async () => {
    await page.goto(LIST, { waitUntil: "networkidle" });
    await main(page).getByLabel("Search bug reports").fill(`freezes ${TAG}`);
    await Promise.all([page.waitForURL(/q=/, { waitUntil: "networkidle" }), main(page).getByLabel("Search bug reports").press("Enter")]);
    await main(page).locator("li.sa-br-row").first().waitFor();
    const rows = await main(page).locator("li.sa-br-row").allInnerTexts();
    await assert(rows.length === 1 && rows[0].includes("Leaderboard freezes"), `rows: ${rows.length}`);
  });

  await check("priority and status dropdowns filter immediately (no Apply button)", async () => {
    await page.goto(`${LIST}?q=${TAG}`, { waitUntil: "networkidle" });
    await Promise.all([page.waitForURL(/priority=LOW/, { waitUntil: "networkidle" }), main(page).locator('select[name="priority"]').selectOption("LOW")]);
    await main(page).locator("li.sa-br-row").first().waitFor();
    let rows = await main(page).locator("li.sa-br-row").allInnerTexts();
    await assert(rows.length === 1 && rows[0].includes("Typo on login"), `LOW rows: ${rows}`);
    await Promise.all([page.waitForURL(/status=OPEN/, { waitUntil: "networkidle" }), main(page).locator('select[name="status"]').selectOption("OPEN")]);
    await main(page).getByText("No bug reports match").waitFor();
    await assert((await main(page).innerText()).includes("No bug reports match"), "no-match state");
    await assert(page.url().includes("q=") && page.url().includes("priority=LOW"), "other filters kept");
  });

  await check("stat cards show counts and toggle the status filter", async () => {
    await page.goto(LIST, { waitUntil: "networkidle" });
    const counts = await prisma.bugReport.groupBy({ by: ["status"], _count: { _all: true } });
    const open = counts.find((c) => c.status === "OPEN")?._count._all ?? 0;
    const card = main(page).locator("a.sa-br-stat.is-red");
    await assert((await card.innerText()).includes(String(open)), "open count");
    await Promise.all([page.waitForURL(/status=OPEN/), card.click()]);
    await assert((await card.getAttribute("aria-pressed")) === "true", "selected");
    await Promise.all([page.waitForURL((u) => !u.search.includes("status=")), main(page).locator("a.sa-br-stat.is-red").click()]);
  });

  await check("the detail page saves status and priority together", async () => {
    const r = await prisma.bugReport.findFirstOrThrow({ where: { description: { contains: `freezes ${TAG}` } } });
    await page.goto(`${BASE}/admin/bug-reports/${r.id}`, { waitUntil: "networkidle" });
    await main(page).locator('select[name="status"]').selectOption("IN_PROGRESS");
    await main(page).locator('select[name="priority"]').selectOption("CRITICAL");
    await Promise.all([page.waitForURL(/saved=1/), main(page).getByRole("button", { name: "Save Status" }).click()]);
    const after = await prisma.bugReport.findUniqueOrThrow({ where: { id: r.id } });
    await assert(after.status === "IN_PROGRESS" && after.priority === "CRITICAL", `${after.status}/${after.priority}`);
    await assert((await main(page).innerText()).includes("Critical priority"), "badge updated");
  });

  await check("a bogus priority value is ignored", async () => {
    const r = await prisma.bugReport.findFirstOrThrow({ where: { description: { contains: `freezes ${TAG}` } } });
    await page.goto(`${BASE}/admin/bug-reports/${r.id}`, { waitUntil: "networkidle" });
    await main(page).locator('select[name="priority"]').evaluate((el) => { const o = document.createElement("option"); o.value = "URGENT!!"; el.appendChild(o); el.value = "URGENT!!"; });
    await Promise.all([page.waitForURL(/saved=1/), main(page).getByRole("button", { name: "Save Status" }).click()]);
    const after = await prisma.bugReport.findUniqueOrThrow({ where: { id: r.id } });
    await assert(after.priority === "CRITICAL", `priority: ${after.priority}`);
  });

  await page.close();
}

try {
  await run();
} catch (err) {
  fail("admin-bug-reports-page e2e crashed", err?.stack || err);
} finally {
  try { await prisma.bugReport.deleteMany({ where: { description: { contains: TAG } } }); } catch (e) { console.log("cleanup failed", e); }
  await browser.close();
  await prisma.$disconnect();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.log("FAILURES:", failed); process.exit(1); }
}
