// Admin HootArena list (2026-11-09): totals, search by title/PIN, status /
// host / sort controls, delete from the list (Lobby only), and live games
// cannot be deleted from here. Local/dev DB only.
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
const TAG = `HAL ${RUN_ID}`;
const LIST = `${BASE}/admin/hootarena`;
const pin = (n) => String(900000 + ((RUN_ID + n) % 99999));

async function run() {
  const superAdmin = await prisma.user.findUniqueOrThrow({ where: { username: SUPER.username } });
  const lobby = await prisma.hootGame.create({ data: { title: `${TAG} lobby`, pin: pin(1), hostId: superAdmin.id } });
  const live = await prisma.hootGame.create({ data: { title: `${TAG} live`, pin: pin(2), hostId: superAdmin.id, status: "QUESTION", currentQuestionIndex: 0 } });

  const page = await browser.newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="username"]', SUPER.username);
  await page.fill('input[name="password"]', SUPER.password);
  await Promise.all([page.waitForURL(`${BASE}/admin`), page.click('button[type="submit"]')]);

  await check("totals count every active game", async () => {
    await page.goto(LIST, { waitUntil: "networkidle" });
    const n = await prisma.hootGame.count({ where: { status: { not: "FINISHED" } } });
    await assert((await main(page).locator(".sa-br-stat").first().innerText()).includes(String(n)), "total games");
  });

  await check("search by PIN finds the game", async () => {
    await main(page).getByLabel("Search HootArena games").fill(lobby.pin);
    await Promise.all([page.waitForURL(/q=/, { waitUntil: "networkidle" }), main(page).getByLabel("Search HootArena games").press("Enter")]);
    const rows = await main(page).locator("li.sa-ha-row").allInnerTexts();
    await assert(rows.length === 1 && rows[0].includes(`${TAG} lobby`) && rows[0].includes("Lobby"), `rows: ${rows}`);
  });

  await check("status filter shows only live games", async () => {
    await page.goto(`${LIST}?q=${encodeURIComponent(TAG.toLowerCase())}`, { waitUntil: "networkidle" });
    await Promise.all([page.waitForURL(/status=live/, { waitUntil: "networkidle" }), main(page).locator('select[name="status"]').selectOption("live")]);
    const rows = await main(page).locator("li.sa-ha-row").allInnerTexts();
    await assert(rows.length === 1 && rows[0].includes(`${TAG} live`) && rows[0].includes("Live"), `rows: ${rows}`);
  });

  await check("live games link to the host screen and can't be deleted from the list", async () => {
    const row = main(page).locator("li.sa-ha-row", { hasText: `${TAG} live` });
    await assert((await row.getByRole("link", { name: "Open" }).getAttribute("href")) === `/admin/hootarena/${live.id}/host`, "host link");
    await assert((await row.locator("button.sa-ha-delete").count()) === 0, "no delete button");
  });

  await check("sort and host controls keep working", async () => {
    await page.goto(`${LIST}?q=${encodeURIComponent(TAG.toLowerCase())}`, { waitUntil: "networkidle" });
    await Promise.all([page.waitForURL(/sort=oldest/, { waitUntil: "networkidle" }), main(page).locator('select[name="sort"]').selectOption("oldest")]);
    const titles = await main(page).locator("li.sa-ha-row .sa-ha-title a").allInnerTexts();
    await assert(titles[0].includes("lobby") && titles[1].includes("live"), `order: ${titles}`);
    await Promise.all([page.waitForURL(/host=[a-z0-9]/, { waitUntil: "networkidle" }), main(page).locator('select[name="host"]').selectOption(superAdmin.id)]);
    await assert((await main(page).locator("li.sa-ha-row").count()) === 2, "host filter");
  });

  await check("a lobby game can be deleted from the list", async () => {
    await page.goto(`${LIST}?q=${encodeURIComponent(TAG.toLowerCase())}`, { waitUntil: "networkidle" });
    const row = main(page).locator("li.sa-ha-row", { hasText: `${TAG} lobby` });
    await row.getByRole("button", { name: `Delete ${TAG} lobby` }).click();
    await row.waitFor({ state: "detached" });
    await assert(!(await prisma.hootGame.findUnique({ where: { id: lobby.id } })), "deleted");
  });
  await check("game page: the pencil renames the game", async () => {
    const g = await prisma.hootGame.create({ data: { title: `${TAG} page`, pin: pin(3), hostId: superAdmin.id } });
    await page.goto(`${BASE}/admin/hootarena/${g.id}`, { waitUntil: "networkidle" });
    const text = await main(page).innerText();
    await assert(text.includes("Join the Game") && text.includes(g.pin) && text.includes("Download QR"), "join card");
    await main(page).locator("summary[aria-label='Edit title']").click();
    await main(page).locator('input[name="title"]').fill(`${TAG} renamed`);
    await main(page).getByRole("button", { name: "Save details" }).click();
    await main(page).getByRole("heading", { name: `${TAG} renamed` }).waitFor();
    const after = await prisma.hootGame.findUniqueOrThrow({ where: { id: g.id } });
    await assert(after.title === `${TAG} renamed`, `title: ${after.title}`);
  });

  await check("game page: the more-actions menu deletes the game", async () => {
    const g = await prisma.hootGame.findFirstOrThrow({ where: { title: `${TAG} renamed` } });
    await main(page).locator("summary[aria-label='More actions']").click();
    await Promise.all([page.waitForURL((u) => u.pathname === "/admin/hootarena"), main(page).getByRole("button", { name: "Delete this game permanently" }).click()]);
    await assert(!(await prisma.hootGame.findUnique({ where: { id: g.id } })), "deleted");
  });
  await page.close();
}

try {
  await run();
} catch (err) {
  fail("admin-hootarena-list e2e crashed", err?.stack || err);
} finally {
  try { await prisma.hootGame.deleteMany({ where: { title: { startsWith: TAG } } }); } catch (e) { console.log("cleanup failed", e); }
  await browser.close();
  await prisma.$disconnect();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.log("FAILURES:", failed); process.exit(1); }
}
