// Responsive audit across the whole app.
//
// privacy-and-responsive.mjs already checks six pages at a single 390px
// viewport. That answers "does the phone layout break on the main screens?",
// not "is the app usable on the devices students actually bring", so this
// suite widens both axes: every static route, at five viewports from a 320px
// phone to a 1440px desktop.
//
// For each page/viewport it asserts the document does not scroll sideways,
// and when it does it names the widest offending elements rather than only
// reporting a number - a bare scrollWidth tells you something is wrong but
// not what to fix.
//
// Dynamic routes ([id], [qid], ...) are out of scope here: they need fixture
// rows, which the feature suites already create and tear down.
//
// Run: npm run test:e2e:responsive
import "dotenv/config";
import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  throw new Error("ADMIN_USERNAME / ADMIN_PASSWORD must be set (via .env) to run this test");
}

// Widths chosen for what they catch, not for specific handsets: 320 is the
// narrowest screen still in use and breaks fixed-width content; 390 is a
// current phone; 768 is the tablet breakpoint where many grids switch; 1024
// is tablet landscape / small laptop; 1440 catches layouts that only centre
// correctly at one width.
const VIEWPORTS = [
  { label: "320px phone (small)", width: 320, height: 568 },
  { label: "390px phone", width: 390, height: 844 },
  { label: "768px tablet", width: 768, height: 1024 },
  { label: "1024px tablet landscape", width: 1024, height: 768 },
  { label: "1440px desktop", width: 1440, height: 900 },
];

const PUBLIC_PAGES = [
  ["/", "home"],
  ["/login", "student login"],
  ["/admin/login", "admin login"],
  ["/hootarena", "hootarena join"],
  ["/join", "legacy join"],
  ["/homeworks/new", "new homework"],
  ["/my-homeworks", "my homeworks"],
];

const STUDENT_PAGES = [
  ["/dashboard", "student dashboard"],
  ["/dashboard/bug-reports", "student bug reports"],
  ["/dashboard/bug-reports/new", "student new bug report"],
  ["/dashboard/inco", "student INCO"],
  ["/dashboard/leaderboard", "student leaderboard"],
  ["/dashboard/profile", "student profile"],
];

const ADMIN_PAGES = [
  ["/admin", "admin dashboard"],
  ["/admin/admins", "admin admins"],
  ["/admin/bug-reports", "admin bug reports"],
  ["/admin/hootarena", "admin hootarena"],
  ["/admin/hootarena/new", "admin new hootarena"],
  ["/admin/inco", "admin INCO"],
  ["/admin/leaderboard", "admin leaderboard"],
  ["/admin/profile", "admin profile"],
  ["/admin/programs", "admin programs"],
  ["/admin/quizzes", "admin quizzes"],
  ["/admin/quizzes/new", "admin new quiz"],
  ["/admin/students", "admin students"],
];

const results = [];
function ok(name) { results.push({ name, pass: true }); }
function fail(name, err) { results.push({ name, pass: false, err: String(err) }); console.log("FAIL:", name, "-", err); }

const browser = await chromium.launch();
const RUN_ID = Date.now();
const STUDENT_USERNAME = `resp-${RUN_ID}`;
const STUDENT_PASSWORD = "pass-123456";

/**
 * Measures sideways overflow and, when present, identifies the widest
 * elements sticking out past the viewport. Children inheriting an ancestor's
 * overflow are dropped so the report names the element actually at fault.
 */
async function measure(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const limit = doc.clientWidth;
    const offenders = [];
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right <= limit + 1) continue;
      if (el.parentElement && el.parentElement !== document.body) {
        const pr = el.parentElement.getBoundingClientRect();
        if (pr.right > limit + 1) continue; // parent already reported
      }
      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || "").slice(0, 60),
        right: Math.round(r.right),
        text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40),
      });
    }
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: limit,
      offenders: offenders.sort((a, b) => b.right - a.right).slice(0, 3),
    };
  });
}

async function auditPage(page, url, label, viewport) {
  const name = `${label} @ ${viewport.label}`;
  try {
    await page.goto(`${BASE}${url}`, { waitUntil: "load", timeout: 30000 });
    const { scrollWidth, clientWidth, offenders } = await measure(page);
    if (scrollWidth > clientWidth + 1) {
      const detail = offenders.length
        ? offenders.map((o) => `<${o.tag} class="${o.cls}"> right=${o.right}px "${o.text}"`).join(" | ")
        : "(no single element identified - likely a min-width or negative margin)";
      throw new Error(`overflows by ${scrollWidth - clientWidth}px (scrollWidth=${scrollWidth} > clientWidth=${clientWidth}). Widest: ${detail}`);
    }
    ok(name);
  } catch (err) {
    fail(name, err.message || err);
  }
}

async function loginStudent(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.fill('input[name="username"]', STUDENT_USERNAME);
  await page.fill('input[name="password"]', STUDENT_PASSWORD);
  await Promise.all([page.waitForURL(`${BASE}/dashboard`), page.click('button[type="submit"]')]);
}

async function loginAdmin(page) {
  await page.goto(`${BASE}/admin/login`, { waitUntil: "load" });
  await page.fill('input[name="username"]', ADMIN_USERNAME);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await Promise.all([page.waitForURL(`${BASE}/admin`), page.click('button[type="submit"]')]);
}

// A throwaway student, so the student-side pages are audited as a real
// logged-in user rather than as redirects to /login.
async function createStudent() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await loginAdmin(page);
  await page.goto(`${BASE}/admin/students`, { waitUntil: "load" });
  const main = page.locator("main");
  await main.locator('input[name="firstName"]').fill("Resp");
  await main.locator('input[name="lastName"]').fill("Audit");
  await main.locator('input[name="username"]').fill(STUDENT_USERNAME);
  await main.locator('input[name="password"]').fill(STUDENT_PASSWORD);
  await Promise.all([
    page.waitForURL((u) => u.searchParams.get("created") === STUDENT_USERNAME.toLowerCase()),
    main.getByRole("button", { name: "Create student" }).click(),
  ]);
  await ctx.close();
}

async function run() {
  await createStudent();

  for (const viewport of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });

    const anon = await ctx.newPage();
    for (const [url, label] of PUBLIC_PAGES) await auditPage(anon, url, label, viewport);
    await anon.close();

    const student = await ctx.newPage();
    await loginStudent(student);
    for (const [url, label] of STUDENT_PAGES) await auditPage(student, url, label, viewport);
    await student.close();

    const admin = await ctx.newPage();
    await loginAdmin(admin);
    for (const [url, label] of ADMIN_PAGES) await auditPage(admin, url, label, viewport);
    await admin.close();

    await ctx.close();
    const done = results.length;
    const bad = results.filter((r) => !r.pass).length;
    console.log(`-- ${viewport.label}: ${done} checked so far, ${bad} failing`);
  }
}

try {
  await run();
} catch (err) {
  fail("responsive audit harness", err.message || err);
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.pass).length;
console.log("");
for (const r of results.filter((x) => !x.pass)) console.log("FAIL:", r.name, "-", r.err);
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
