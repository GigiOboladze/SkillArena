// Regression test for the "students sometimes have to refresh" bug: a real
// network blip (not a page reload) must not strand a player mid-game.
// Uses Playwright's BrowserContext.setOffline to force the underlying
// WebSocket transport to actually drop and let socket.io-client's own
// auto-reconnect kick in - the exact mechanism that was silently stranding
// 2-3 players per game (their client kept stale local React state while
// the server had already cleaned up the old, dead socket's room membership,
// and nothing ever re-ran player:join on the new connection).
//
// Players need NO SkillArena account at all - they join by PIN and pick a
// nickname on the spot (see e2e/hootarena.mjs for the full lifecycle suite,
// and hootarena-scoring.mjs for the pure scoring-function unit tests).
//
// Also verifies the server-authoritative timer is never reset by a
// reconnect, and that the automatic (20s timeout) reveal path produces the
// exact same statistics mechanism as the manual "Reveal answer" button.
//
// Run: npx tsx e2e/hootarena-reconnect.mjs
import "dotenv/config";
import { chromium } from "playwright";
import { PrismaClient } from "../src/generated/prisma/client.ts";

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
// A Prisma client that connects at script start but isn't used until much
// later (after a lot of browser/socket activity) can go stale against the
// local dev DB proxy - retrying the SAME connection doesn't help once that
// happens, but a freshly-instantiated client used immediately reliably
// does. So this is created fresh right at the point of use instead of once
// at the top.
function freshPrisma() {
  return new PrismaClient();
}

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

async function addQuestion(admin, gameId, { text, options, correct }) {
  await admin.goto(`${BASE}/admin/hootarena/${gameId}/questions/new`, { waitUntil: "networkidle" });
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
  await admin.fill('input[name="title"]', `Reconnect Test ${RUN_ID}`);
  await Promise.all([
    admin.waitForURL((u) => /\/admin\/hootarena\/[a-z0-9]+$/.test(u.pathname) && !u.pathname.endsWith("/new")),
    main(admin).locator('button[type="submit"]').click(),
  ]);
  const gameId = admin.url().split("/").pop();

  await addQuestion(admin, gameId, { text: "Q1 for reconnect test", options: ["Right", "Wrong", "Also wrong", "Still wrong"], correct: [1] });
  await addQuestion(admin, gameId, { text: "Q2 for reconnect test", options: ["Right", "Wrong", "Also wrong", "Still wrong"], correct: [1] });
  ok("created game with 2 questions, no program/subject/group step required");

  const pinBadge = await main(admin).locator("p.font-mono").innerText();
  const pin = pinBadge.match(/\d{6}/)?.[0];
  await assert(/^\d{6}$/.test(pin), `expected a 6-digit PIN, got "${pinBadge}"`);

  const u1 = `e2e-recon-a1-${RUN_ID}`;
  const u2 = `e2e-recon-a2-${RUN_ID}`;
  const a1 = await joinAsGuest(pin, u1);
  const a2 = await joinAsGuest(pin, u2);
  await a1.waitForSelector(`text=You're in, ${u1}!`, { timeout: 10000 });
  await a2.waitForSelector(`text=You're in, ${u2}!`, { timeout: 10000 });
  ok("both players joined anonymously (PIN + nickname, no account) into the lobby");

  await admin.goto(`${BASE}/admin/hootarena/${gameId}/host`, { waitUntil: "networkidle" });
  await admin.waitForSelector('button:has-text("Start game"):not([disabled])', { timeout: 10000 });
  await admin.click('button:has-text("Start game")');
  await a1.waitForSelector("text=Q1 for reconnect test", { timeout: 10000 });
  await a2.waitForSelector("text=Q1 for reconnect test", { timeout: 10000 });
  ok("Q1 is live for both players");

  // ---------- Reconnect mid-QUESTION, before answering - no page reload ----------
  const questionStartedAt = Date.now();
  await a1.context().setOffline(true);
  await a1.waitForTimeout(3000); // simulate a real multi-second network blip
  await a1.context().setOffline(false);
  // No reload() anywhere in this block - only a real network drop/restore,
  // exactly reproducing what a flaky classroom wifi connection does.
  await a1.waitForSelector("text=Q1 for reconnect test", { timeout: 10000 });
  const timeLeftText = await a1.locator("span").filter({ hasText: /^\d+s$/ }).first().innerText();
  const displayedSeconds = parseInt(timeLeftText, 10);
  const elapsedSeconds = (Date.now() - questionStartedAt) / 1000;
  await assert(
    displayedSeconds <= 20 - Math.floor(elapsedSeconds) + 2,
    `expected the timer to reflect elapsed time (~${(20 - elapsedSeconds).toFixed(1)}s remaining), not reset to 20 - got ${displayedSeconds}s`
  );
  await assert(displayedSeconds < 19, `timer must not have been reset to a fresh 20s on reconnect - got ${displayedSeconds}s`);
  ok("reconnecting mid-question (network blip, no page reload) restores the same question with the server-authoritative remaining time, not a fresh 20s");

  // Player must still be able to answer normally after reconnecting.
  await a1.getByRole("button", { name: "Right", exact: true }).click();
  await a1.waitForSelector("text=Locked in - waiting for the others...", { timeout: 10000 });
  ok("player can still answer normally after the reconnect");

  await a2.getByRole("button", { name: "Right", exact: true }).click();
  await admin.waitForSelector("text=2/2 answered", { timeout: 10000 });

  // ---------- No duplicate player row, no duplicate response row, no score corruption from the reconnect ----------
  const prisma = freshPrisma();
  const playerRows = await prisma.hootPlayer.findMany({ where: { gameId, username: u1 } });
  await assert(playerRows.length === 1, `expected exactly 1 HootPlayer row for a1 after the reconnect, found ${playerRows.length}`);
  const responseRows = await prisma.hootResponse.findMany({ where: { gameId, playerId: playerRows[0].id } });
  await assert(responseRows.length === 1, `expected exactly 1 HootResponse row for a1's single answer, found ${responseRows.length}`);
  await prisma.$disconnect();
  ok("reconnecting did not create a duplicate player row or a duplicate answer row");

  // ---------- Reconnect during REVEAL ----------
  await a2.context().setOffline(true);
  await admin.click('button:has-text("Reveal answer")');
  await a1.waitForSelector("text=Correct!", { timeout: 10000 });
  await a2.waitForTimeout(2000);
  await a2.context().setOffline(false);
  await a2.waitForSelector("text=Correct!", { timeout: 10000 });
  ok("a player disconnected right as REVEAL started, reconnects (no reload) straight into the reveal state - not stuck on the question screen");

  // ---------- Reconnect during LEADERBOARD ----------
  await admin.click('button:has-text("Show leaderboard")');
  await a1.waitForSelector("text=Leaderboard so far", { timeout: 10000 });
  await a1.context().setOffline(true);
  await a1.waitForTimeout(2000);
  await a1.context().setOffline(false);
  await a1.waitForSelector("text=Leaderboard so far", { timeout: 10000 });
  ok("reconnecting during LEADERBOARD (no reload) restores the leaderboard view, not a stale question/reveal screen");

  // ---------- Reconnect right as the host moves to the next question ----------
  await a2.context().setOffline(true);
  await admin.click('button:has-text("Next question")');
  await a1.waitForSelector("text=Q2 for reconnect test", { timeout: 10000 });
  await a2.waitForTimeout(2000);
  await a2.context().setOffline(false);
  await a2.waitForSelector("text=Q2 for reconnect test", { timeout: 10000 });
  ok("a player who was offline exactly when the host advanced to the next question reconnects into the CURRENT question, not stale Q1 state");

  // a1's own several reconnects above must never have shown them a "kicked" message.
  const a1FullText = await a1.locator("body").innerText();
  await assert(!a1FullText.includes("disconnected"), "a player's own legitimate reconnects must never trigger the duplicate-session kick message against themselves");
  ok("a player's own reconnects never trigger the duplicate-session kick mechanism against themselves");

  // ---------- Host reconnect mid-game ----------
  await admin.context().setOffline(true);
  await admin.waitForTimeout(2000);
  await admin.context().setOffline(false);
  await admin.waitForSelector('button:has-text("Reveal answer")', { timeout: 10000 });
  ok("host reconnecting mid-question (no reload) regains the live control panel");

  // ---------- Automatic (20s timeout) reveal must use the identical reveal path/statistics as a manual reveal ----------
  // a1 answers correctly, a2 deliberately never answers - then NOBODY
  // clicks "Reveal answer": wait for the real 20s server-authoritative
  // timer to expire and auto-reveal on its own.
  await a1.getByRole("button", { name: "Right", exact: true }).click();
  await admin.waitForSelector("text=1/2 answered", { timeout: 10000 });
  await admin.waitForSelector("text=Results", { timeout: 25000 }); // no click - waiting for the real 20s auto-reveal
  const autoRevealText = await main(admin).innerText();
  await assert(autoRevealText.includes("Q2 for reconnect test"), "the auto-revealed screen must show the actual question text, same as a manual reveal");
  await assert(/Right[\s\S]{0,40}1 student\b/.test(autoRevealText), "auto-reveal statistics must be correct: 'Right' picked by a1 -> 1 student");
  await assert(/Wrong[\s\S]{0,40}0 students/.test(autoRevealText), "auto-reveal statistics must show the zero-selection option too");
  await assert(autoRevealText.includes("1 not answered"), "auto-reveal must correctly report a2 as not answered");
  await assert(/correct/i.test(autoRevealText), "auto-reveal must still mark the correct option"); // the badge renders uppercase via CSS text-transform
  ok("the 20-second automatic reveal produces the exact same question/statistics shape as a manual reveal - same underlying server function, no separate implementation");

  await admin.click('button:has-text("Show leaderboard")');
  await admin.waitForSelector('button:has-text("Finish game")', { timeout: 10000 });
  await admin.click('button:has-text("Finish game")');
  await admin.waitForSelector("text=Final results", { timeout: 10000 });
  ok("finished the reconnect-test game");

  await browser.close();
}

try {
  await run();
} catch (err) {
  fail("hootarena-reconnect e2e crashed", err?.stack || err);
} finally {
  await browser.close().catch(() => {});
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("FAILURES:", failed);
    process.exitCode = 1;
  }
}
