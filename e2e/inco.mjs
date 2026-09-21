// E2E coverage for INCO (anonymous feedback): the SUPER_ADMIN-only access
// boundary (enforced server-side, not just a hidden nav link) and the full
// anonymous submit -> reference code -> public status-check round trip.
// Companion to smoke.mjs / skillarena.mjs / admin-bugreports.mjs - run:
//   npm run test:e2e:inco
import "dotenv/config";
import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const SUPER_USERNAME = process.env.ADMIN_USERNAME || process.env.ADMIN_EMAIL;
const SUPER_PASSWORD = process.env.ADMIN_PASSWORD;
if (!SUPER_USERNAME || !SUPER_PASSWORD) {
  throw new Error("ADMIN_USERNAME / ADMIN_PASSWORD must be set (via .env) to run this test");
}

const results = [];
function ok(name) { results.push({ name, pass: true }); console.log("PASS:", name); }
function fail(name, err) { results.push({ name, pass: false, err: String(err) }); console.log("FAIL:", name, "-", err); }
async function assert(cond, message) { if (!cond) throw new Error(message); }

const browser = await chromium.launch();
const main = (p) => p.locator("main");
const RUN_ID = Date.now();

async function run() {
  const superAdmin = await browser.newPage();
  await superAdmin.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
  await superAdmin.fill('input[name="username"]', SUPER_USERNAME);
  await superAdmin.fill('input[name="password"]', SUPER_PASSWORD);
  await Promise.all([superAdmin.waitForURL(`${BASE}/admin`), superAdmin.click('button[type="submit"]')]);
  ok("super admin login");

  const superNavText = await superAdmin.locator("header").innerText();
  await assert(superNavText.includes("INCO"), "super admin must see the INCO nav link");
  ok("INCO nav link shown to super admin");

  // ---------- A regular (non-super) admin must be blocked, server-side ----------
  const regularUsername = `e2e-inco-admin-${RUN_ID}`;
  await superAdmin.goto(`${BASE}/admin/admins`, { waitUntil: "networkidle" });
  await main(superAdmin).locator('input[name="username"]').fill(regularUsername);
  await main(superAdmin).locator('input[name="password"]').fill("adminpass123");
  await main(superAdmin).locator('input[name="confirmPassword"]').fill("adminpass123");
  await Promise.all([
    superAdmin.waitForURL((u) => u.searchParams.get("created") === "1"),
    main(superAdmin).getByRole("button", { name: "Create admin" }).click(),
  ]);
  ok("created a throwaway regular admin");

  const regularAdmin = await browser.newPage();
  await regularAdmin.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
  await regularAdmin.fill('input[name="username"]', regularUsername);
  await regularAdmin.fill('input[name="password"]', "adminpass123");
  await Promise.all([regularAdmin.waitForURL(`${BASE}/admin`), regularAdmin.click('button[type="submit"]')]);

  const regularNavText = await regularAdmin.locator("header").innerText();
  await assert(!regularNavText.includes("INCO"), "regular admin must not see an INCO nav link");
  ok("INCO nav link hidden from regular admin");

  await regularAdmin.goto(`${BASE}/admin/inco`, { waitUntil: "networkidle" });
  const blockedText = await regularAdmin.locator("body").innerText();
  await assert(blockedText.includes("This page could not be found"), "regular admin hitting /admin/inco directly must get 404, not the inbox");
  ok("regular admin is blocked server-side from /admin/inco (direct URL, not just hidden nav)");
  await regularAdmin.close();

  // Clean up the throwaway admin so repeat runs don't pile up admin slots (max 8).
  await superAdmin.goto(`${BASE}/admin/admins`, { waitUntil: "networkidle" });
  const adminRow = main(superAdmin).locator("li", { hasText: regularUsername });
  await adminRow.getByRole("button", { name: "Delete" }).click();
  await superAdmin.waitForLoadState("networkidle");
  ok("cleaned up the throwaway regular admin");

  // ---------- Anonymous submit -> code -> public status check ----------
  const studentUser = `e2e-inco-stu-${RUN_ID}`;
  await superAdmin.goto(`${BASE}/admin/students`, { waitUntil: "networkidle" });
  await main(superAdmin).locator('input[name="firstName"]').fill("Inco");
  await main(superAdmin).locator('input[name="lastName"]').fill("Tester");
  await main(superAdmin).locator('input[name="username"]').fill(studentUser);
  await main(superAdmin).locator('input[name="password"]').fill("pass-123456");
  await Promise.all([
    superAdmin.waitForURL((u) => u.searchParams.get("created") === studentUser.toLowerCase()),
    main(superAdmin).getByRole("button", { name: "Create student" }).click(),
  ]);
  ok("created throwaway student for the INCO submit/check flow");

  const student = await browser.newPage();
  await student.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await student.fill('input[name="username"]', studentUser);
  await student.fill('input[name="password"]', "pass-123456");
  await Promise.all([student.waitForURL(`${BASE}/dashboard`), student.click('button[type="submit"]')]);

  await student.goto(`${BASE}/dashboard/inco`, { waitUntil: "networkidle" });
  const incoPageText = await main(student).innerText();
  await assert(incoPageText.includes("რაღაც გაქვს სათქმელი?"), "INCO page must show the required Georgian heading");
  ok("INCO page renders the required heading/intro text");

  await student.selectOption('select[name="category"]', "ACADEMIC");
  await student.fill('textarea[name="message"]', "E2E test message " + RUN_ID);
  await student.getByRole("button", { name: "გაგზავნა ანონიმურად" }).click();
  await student.waitForSelector("text=გმადლობთ, მიღებულია!", { timeout: 10000 });
  const codeText = (await student.locator(".font-mono.text-lg.font-bold").innerText()).trim();
  await assert(/^[\w-]{20,}$/.test(codeText), `expected a long reference code, got: ${codeText}`);
  ok(`submission accepted, got reference code (${codeText})`);
  await student.close();

  // Check status WITHOUT being logged in at all (fresh, cookie-less context) -
  // the whole point of the code is that it stands in for identity.
  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  await anonPage.goto(`${BASE}/inco/status`, { waitUntil: "networkidle" });
  await anonPage.fill('input[name="code"]', codeText);
  await anonPage.getByRole("button", { name: "შემოწმება" }).click();
  await anonPage.waitForTimeout(1000);
  const statusPageText = await anonPage.locator("body").innerText();
  await assert(statusPageText.includes("ახალი"), `expected NEW status label "ახალი" on the check page, got: ${statusPageText}`);
  ok("anonymous status check (no login) finds the submission and shows its status");

  // Super admin answers it...
  await superAdmin.goto(`${BASE}/admin/inco`, { waitUntil: "networkidle" });
  await superAdmin.getByText(`E2E test message ${RUN_ID}`).click();
  await superAdmin.fill('textarea[name="response"]', "Thanks, we're looking into it.");
  await Promise.all([
    superAdmin.waitForURL((u) => u.searchParams.get("responded") === "1"),
    main(superAdmin).getByRole("button", { name: "პასუხის გაგზავნა" }).click(),
  ]);
  ok("super admin responded to the submission");

  // ...and the same anonymous code now shows the response, still with no login.
  await anonPage.fill('input[name="code"]', codeText);
  await anonPage.getByRole("button", { name: "შემოწმება" }).click();
  await anonPage.waitForTimeout(1000);
  const respondedText = await anonPage.locator("body").innerText();
  await assert(respondedText.includes("Thanks, we're looking into it."), "the response must be visible via the anonymous code after the admin replies");
  ok("response is retrievable via the same anonymous code, still without login");

  // Wrong code must not leak anything.
  await anonPage.fill('input[name="code"]', "0000-0000-0000-0000-0000");
  await anonPage.getByRole("button", { name: "შემოწმება" }).click();
  await anonPage.waitForTimeout(500);
  const wrongCodeText = await anonPage.locator("body").innerText();
  await assert(wrongCodeText.includes("ვერ მოიძებნა"), "a wrong code must return a not-found message, not another submission");
  ok("wrong/guessed code returns not-found, does not leak another submission");

  await anon.close();
  await superAdmin.close();
  await browser.close();
}

run()
  .then(() => {
    const failed = results.filter((r) => !r.pass);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) process.exitCode = 1;
  })
  .catch((err) => {
    fail("inco e2e crashed", err.message || err);
    console.log(`\n${results.filter((r) => r.pass).length}/${results.length} checks passed`);
    process.exitCode = 1;
  });
