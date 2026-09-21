// End-to-end smoke test covering both game modes against a running dev/prod
// server. Start the app first (`npm run dev`), then: `npm run test:e2e`.
// Reads ADMIN_EMAIL / ADMIN_PASSWORD from .env and creates throwaway
// homeworks/students - safe to run against a local dev database, not
// something you want pointed at real production data.
import "dotenv/config";
import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  throw new Error("ADMIN_USERNAME / ADMIN_PASSWORD must be set (via .env) to run the smoke test");
}
const results = [];
function ok(name) { results.push({ name, pass: true }); console.log("PASS:", name); }
function fail(name, err) { results.push({ name, pass: false, err: String(err) }); console.log("FAIL:", name, "-", err); }
async function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const browser = await chromium.launch();

async function run() {
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  admin.on("pageerror", (e) => console.log("  [admin pageerror]", e.message));
  admin.on("console", (m) => { if (m.type() === "error") console.log("  [admin console.error]", m.text()); });

  // ---------- Admin login ----------
  await admin.goto(`${BASE}/admin/login`);
  await admin.fill('input[name="username"]', ADMIN_USERNAME);
  await admin.fill('input[name="password"]', ADMIN_PASSWORD);
  await Promise.all([
    admin.waitForURL(`${BASE}/admin`),
    admin.click('button[type="submit"]'),
  ]);
  await assert((await admin.textContent("h1")).includes("Overview"), "expected admin dashboard heading");
  ok("admin login redirects to dashboard");

  // Wrong password should stay on login with error
  const wrongCtx = await browser.newContext();
  const wrongPage = await wrongCtx.newPage();
  await wrongPage.goto(`${BASE}/admin/login`);
  await wrongPage.fill('input[name="username"]', ADMIN_USERNAME);
  await wrongPage.fill('input[name="password"]', "wrong-password");
  await wrongPage.click('button[type="submit"]');
  await wrongPage.waitForURL(/error=invalid/);
  ok("wrong admin password rejected");
  await wrongCtx.close();

  // Unauthenticated visit to /admin should redirect to login (proxy.ts)
  const anonCtx = await browser.newContext();
  const anonPage = await anonCtx.newPage();
  await anonPage.goto(`${BASE}/admin`);
  await assert(anonPage.url().includes("/admin/login"), "expected redirect to /admin/login, got " + anonPage.url());
  ok("proxy blocks unauthenticated /admin access");
  await anonCtx.close();

  // ================= ASYNC HOMEWORK FLOW =================
  await admin.goto(`${BASE}/homeworks/new`);
  await admin.fill('input[name="title"]', "Async Smoke Test");
  // ASYNC is default-checked
  await Promise.all([
    admin.waitForURL(/\/homeworks\/(?!new)[^/]+$/),
    admin.click('main form button[type="submit"]'),
  ]);
  const asyncHwId = admin.url().split("/").pop();
  ok(`created ASYNC homework (${asyncHwId})`);

  // Add MC question
  await admin.goto(`${BASE}/homeworks/${asyncHwId}/questions/new`);
  await admin.fill('textarea[name="text"]', "What is 2 + 2?");
  await admin.fill('input[name="opt1"]', "3");
  await admin.fill('input[name="opt2"]', "4");
  await admin.fill('input[name="opt3"]', "5");
  await admin.check('input[name="correct"][value="2"]');
  await Promise.all([
    admin.waitForURL(`${BASE}/homeworks/${asyncHwId}`),
    admin.click('main form button[type="submit"]'),
  ]);
  ok("added multiple choice question");

  // Add paragraph question
  await admin.goto(`${BASE}/homeworks/${asyncHwId}/questions/new`);
  await admin.fill('textarea[name="text"]', "Explain your reasoning.");
  await admin.check('input[name="type"][value="PARAGRAPH"]');
  await Promise.all([
    admin.waitForURL(`${BASE}/homeworks/${asyncHwId}`),
    admin.click('main form button[type="submit"]'),
  ]);
  ok("added paragraph question");

  // Open the homework
  await admin.click('form button:has-text("Open")');
  await admin.waitForSelector('button:disabled:has-text("Open")');
  const joinCode = (await admin.textContent("p.font-mono")).trim();
  await assert(/^[A-Z0-9]{6}$/.test(joinCode), "expected a 6-char join code, got " + joinCode);
  ok(`homework opened, join code ${joinCode}`);

  // ---------- Student joins ASYNC homework ----------
  const s1Ctx = await browser.newContext();
  const s1 = await s1Ctx.newPage();
  await s1.goto(`${BASE}/join`);
  await s1.fill('input[name="code"]', joinCode.toLowerCase());
  await Promise.all([s1.waitForURL(new RegExp(`/join/${joinCode}$`)), s1.click('button[type="submit"]')]);
  await s1.fill('input[name="firstName"]', "Ada");
  await s1.fill('input[name="lastName"]', "Lovelace");
  await Promise.all([
    s1.waitForURL(new RegExp(`/play/${asyncHwId}/q/0$`)),
    s1.click('button[type="submit"]'),
  ]);
  ok("student joined async homework and landed on question 0");

  // Answer Q0 correctly (option "4") - tapping the answer tile auto-submits
  // the enclosing form (see AsyncOptions.tsx), there's no separate radio +
  // submit-button step for multiple choice.
  const q0Text = await s1.textContent("h1");
  await assert(q0Text.includes("2 + 2"), "expected question 0 text, got " + q0Text);
  await Promise.all([
    s1.waitForURL(new RegExp(`/play/${asyncHwId}/q/1$`)),
    s1.getByRole("button", { name: "4", exact: true }).click(),
  ]);
  ok("student answered question 0 (multiple choice)");

  // Answer Q1 (paragraph) and finish
  await s1.fill('textarea[name="textAnswer"]', "Because addition works that way.");
  await Promise.all([
    s1.waitForURL(new RegExp(`/play/${asyncHwId}/done$`)),
    s1.click('button[type="submit"]'),
  ]);
  const doneText = await s1.textContent("body");
  await assert(doneText.includes("1,000") || doneText.includes("1000"), "expected 1000 points shown, got: " + doneText);
  ok("student finished async homework with correct running score");

  // ---------- Public leaderboard ----------
  await s1.goto(`${BASE}/play/${asyncHwId}/leaderboard`);
  const lbText = await s1.textContent("body");
  await assert(lbText.includes("Ada Lovelace"), "expected Ada Lovelace on leaderboard");
  await assert(lbText.includes("pending grading"), "expected pending grading badge");
  ok("public leaderboard shows student with pending grading");

  // ---------- Admin grades the paragraph answer ----------
  await admin.goto(`${BASE}/homeworks/${asyncHwId}/grade`);
  await assert((await admin.textContent("body")).includes("Because addition works"), "expected pending answer text");
  await admin.check('input[name="verdict"][value="correct"]');
  await admin.fill('input[name="points"]', "500");
  await admin.click('button:has-text("Save")');
  await admin.waitForSelector("text=Nothing left to grade.");
  ok("admin graded the paragraph answer");

  await admin.goto(`${BASE}/homeworks/${asyncHwId}/leaderboard`);
  const adminLbText = await admin.textContent("body");
  await assert(adminLbText.includes("1,500"), "expected total 1500 after grading, got: " + adminLbText);
  ok("leaderboard reflects graded score (1500 total)");

  await s1Ctx.close();

  // ================= LIVE HOMEWORK FLOW =================
  await admin.goto(`${BASE}/homeworks/new`);
  await admin.fill('input[name="title"]', "Live Smoke Test");
  await admin.check('input[name="mode"][value="LIVE"]');
  await Promise.all([
    admin.waitForURL(/\/homeworks\/(?!new)[^/]+$/),
    admin.click('main form button[type="submit"]'),
  ]);
  const liveHwId = admin.url().split("/").pop();
  ok(`created LIVE homework (${liveHwId})`);

  await admin.goto(`${BASE}/homeworks/${liveHwId}/questions/new`);
  await admin.fill('textarea[name="text"]', "Capital of France?");
  await admin.fill('input[name="timeLimitSec"]', "6");
  await admin.fill('input[name="opt1"]', "Paris");
  await admin.fill('input[name="opt2"]', "Lyon");
  await admin.check('input[name="correct"][value="1"]');
  await Promise.all([
    admin.waitForURL(`${BASE}/homeworks/${liveHwId}`),
    admin.click('main form button[type="submit"]'),
  ]);
  ok("added live question");

  await admin.goto(`${BASE}/homeworks/${liveHwId}`);
  await admin.click('form button:has-text("Open")');
  await admin.waitForSelector('button:disabled:has-text("Open")');
  const liveJoinCode = (await admin.textContent("p.font-mono")).trim();
  ok(`live homework opened, join code ${liveJoinCode}`);

  const s2Ctx = await browser.newContext();
  const s2 = await s2Ctx.newPage();
  s2.on("pageerror", (e) => console.log("  [student pageerror]", e.message));
  await s2.goto(`${BASE}/join/${liveJoinCode}`);
  await s2.fill('input[name="firstName"]', "Grace");
  await s2.fill('input[name="lastName"]', "Hopper");
  await Promise.all([
    s2.waitForURL(`${BASE}/play/${liveHwId}`),
    s2.click('button[type="submit"]'),
  ]);
  await s2.waitForSelector("text=You're in, Grace!", { timeout: 10000 });
  ok("student joined live lobby via socket.io");

  const hostPage = await adminCtx.newPage();
  hostPage.on("pageerror", (e) => console.log("  [host pageerror]", e.message));
  await hostPage.goto(`${BASE}/homeworks/${liveHwId}/host`);
  await hostPage.waitForSelector("text=1", { timeout: 10000 }); // player count
  await hostPage.waitForSelector('button:has-text("Start game"):not([disabled])', { timeout: 10000 });
  ok("host sees 1 player in lobby, start enabled");

  await hostPage.click('button:has-text("Start game")');
  await s2.waitForSelector("text=Capital of France?", { timeout: 10000 });
  await hostPage.waitForSelector("text=Capital of France?", { timeout: 10000 });
  ok("both host and student see the live question");

  // Multiple-choice tiles auto-submit on click (see LiveGame.tsx
  // selectMultipleChoice) - there's no separate "Submit answer" button for
  // this question type, only for the paragraph/free-text branch.
  await s2.getByRole("button", { name: "Paris", exact: true }).click();
  await s2.waitForSelector("text=Locked in - waiting for the others...", { timeout: 5000 });
  ok("student submitted live answer");

  await hostPage.waitForSelector("text=1/1 answered", { timeout: 10000 });
  ok("host sees live answer count update in real time");

  await hostPage.click('button:has-text("Reveal answer")');
  await s2.waitForSelector("text=Correct!", { timeout: 10000 });
  await hostPage.waitForSelector("text=Grace Hopper", { timeout: 10000 });
  ok("reveal phase shows correct result to student and leaderboard to host");

  await hostPage.click('button:has-text("Next")');
  await s2.waitForSelector("text=Final leaderboard", { timeout: 10000 });
  await hostPage.waitForSelector("text=Final leaderboard", { timeout: 10000 });
  ok("game finished with final leaderboard shown to both host and student");

  await s2Ctx.close();
  await adminCtx.close();
}

try {
  await run();
} catch (err) {
  fail("smoke test crashed", err?.stack || err);
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("FAILURES:", failed);
    process.exit(1);
  }
}
