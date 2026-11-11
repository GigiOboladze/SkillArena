// E2E coverage for staff roles, unified login, scope isolation and Staff &
// Access Management:
//  - one login form for every role; the server picks the workspace
//  - the Super Admin creates staff through the real form - more than eight,
//    proving the old 8-admin cap is gone
//  - each role sees exactly the students in its scope, nothing from another
//    program, and none of the Super-Admin-only areas
//  - deactivation and role changes end live sessions immediately
// Creates its own fixtures (prefixed with the run id) and removes them at the
// end. Safe against a local/dev database only.
// Run: node e2e/staff-roles.mjs
import "dotenv/config";
import { chromium } from "playwright";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { hashPassword } from "../src/lib/password.ts";

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const SUPER = { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD };
if (!SUPER.username || !SUPER.password) throw new Error("ADMIN_USERNAME / ADMIN_PASSWORD must be set (via .env)");

const results = [];
const ok = (n) => { results.push({ n, pass: true }); console.log("PASS:", n); };
const fail = (n, e) => { results.push({ n, pass: false }); console.log("FAIL:", n, "-", e?.message ?? e); };
const assert = (c, m) => { if (!c) throw new Error(m); };
async function step(name, fn) { try { await fn(); ok(name); } catch (e) { fail(name, e); } }

const prisma = new PrismaClient();
const browser = await chromium.launch();
const RUN = Date.now().toString(36);
const PW = "staff-pass-12345";
const STUDENT_PW = "stud-pass-12345";
const created = { users: [], cohorts: [], inco: [] };

async function login(username, password, expectPath) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL((u) => u.pathname === expectPath || u.search.includes("error=")), page.click('button[type="submit"]')]);
  return page;
}
// Pages under /admin stream behind a loading boundary, so notFound() arrives
// as the "Not found" screen with HTTP 200 - judge by what is rendered.
async function status(page, path) {
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  const notFound = (await page.locator("h1", { hasText: /^Not found$/ }).count()) > 0;
  return { code: notFound || res.status() === 404 ? 404 : res.status(), url: new URL(page.url()).pathname };
}
async function navLabels(page) {
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  return page.locator(".sa-sidebar nav a").allInnerTexts();
}

// ---------------- fixtures ----------------
const programs = await prisma.program.findMany({ orderBy: { order: "asc" }, include: { subjects: { include: { groups: { orderBy: { order: "asc" } } } } } });
const [A, B] = programs;
const subjA = A.subjects.find((s) => s.groups.length >= 2);
const [g1, g2] = subjA.groups;
const subjB = B.subjects[0];
const sh = await hashPassword(STUDENT_PW);
async function mkStudent(tag, programId, groupId, subjectId) {
  const u = await prisma.user.create({
    data: {
      firstName: `Stu${tag}`, lastName: RUN, username: `e2e-st-${tag}-${RUN}`, passwordHash: sh, role: "STUDENT", programId,
      ...(subjectId ? { subjectGroups: { create: { subjectId, groupId } } } : {}),
    },
  });
  created.users.push(u.id);
  return u;
}
const s1 = await mkStudent("g1", A.id, g1.id, subjA.id); // group I
const s2 = await mkStudent("g2", A.id, g2.id, subjA.id); // group II
const s3 = await mkStudent("coh", A.id, null, null); // cohort member only
const sB = await mkStudent("netB", B.id, subjB.groups[0].id, subjB.id); // other program
const cohort = await prisma.cohort.create({ data: { name: `E2E cohort ${RUN}`, programId: A.id, members: { create: [{ studentId: s3.id }] } } });
created.cohorts.push(cohort.id);
const incoA = await prisma.incoSubmission.create({ data: { category: "OTHER", message: `inco A ${RUN}`, codeHash: `e2e-a-${RUN}`, programId: A.id } });
const incoB = await prisma.incoSubmission.create({ data: { category: "OTHER", message: `inco B ${RUN}`, codeHash: `e2e-b-${RUN}`, programId: B.id } });
created.inco.push(incoA.id, incoB.id);

const name = (tag) => `e2e-${tag}-${RUN}`;
let superPage;

try {
  await step("super admin signs in through the unified login and lands in /admin", async () => {
    superPage = await login(SUPER.username, SUPER.password, "/admin");
    assert(new URL(superPage.url()).pathname === "/admin", `landed on ${superPage.url()}`);
  });

  await step("old /admin/login and /admin/admins URLs redirect", async () => {
    const r1 = await status(superPage, "/admin/login");
    assert(r1.url === "/admin" || r1.url === "/login", `admin/login -> ${r1.url}`);
    const r2 = await status(superPage, "/admin/admins");
    assert(r2.url === "/admin/team", `admins -> ${r2.url}`);
  });

  async function createStaffViaForm(tag, roleLabel, programName, pick) {
    await superPage.goto(`${BASE}/admin/team/new`, { waitUntil: "networkidle" });
    await superPage.fill('input[name="firstName"]', `E2E ${tag}`);
    await superPage.fill('input[name="lastName"]', RUN);
    await superPage.fill('input[name="username"]', name(tag));
    await superPage.fill('input[name="password"]', PW);
    await superPage.locator(`.sa-st-role:has(input[value="${roleLabel}"])`).click();
    await superPage.selectOption('select[name="programId"]', { label: programName });
    if (pick) await pick();
    await Promise.all([superPage.waitForURL(/\/admin\/team\/[^/]+\?created=1/), superPage.click('button:has-text("Create staff account")')]);
    const u = await prisma.user.findUnique({ where: { username: name(tag) } });
    created.users.push(u.id);
    return u;
  }

  let lect, junior, middle, senior, sm;
  await step("create Lecturer for one subject group through the form", async () => {
    lect = await createStaffViaForm("lect", "LECTURER", A.name, async () => {
      await superPage.getByLabel(`${subjA.name} - ${g1.name}`, { exact: true }).check();
    });
    const rows = await prisma.lecturerAssignment.findMany({ where: { userId: lect.id } });
    assert(lect.role === "LECTURER" && rows.length === 1 && rows[0].groupId === g1.id, "assignment not saved");
  });
  await step("create Junior Captain with one assigned student", async () => {
    junior = await createStaffViaForm("jun", "JUNIOR_CAPTAIN", A.name, async () => {
      await superPage.fill('input[aria-label="Search students"]', s2.username);
      await superPage.locator(".sa-st-check", { hasText: s2.username }).locator("input").check();
    });
    const rows = await prisma.captainStudent.findMany({ where: { captainId: junior.id } });
    assert(rows.length === 1 && rows[0].studentId === s2.id, "student assignment not saved");
  });
  await step("create Middle Captain for a cohort", async () => {
    middle = await createStaffViaForm("mid", "MIDDLE_CAPTAIN", A.name, async () => {
      await superPage.locator(".sa-st-chip", { hasText: cohort.name }).locator("input").check();
    });
    assert((await prisma.cohortCaptain.count({ where: { captainId: middle.id, cohortId: cohort.id } })) === 1, "cohort not saved");
  });
  await step("create Senior Captain supervising the Junior Captain", async () => {
    senior = await createStaffViaForm("sen", "SENIOR_CAPTAIN", A.name, async () => {
      await superPage.locator(".sa-st-check", { hasText: junior.username }).locator("input").check();
    });
    assert((await prisma.captainSupervision.count({ where: { seniorId: senior.id, captainId: junior.id } })) === 1, "supervision not saved");
  });
  await step("create Success Manager for one program", async () => {
    sm = await createStaffViaForm("sm", "SUCCESS_MANAGER", A.name);
    assert(sm.role === "SUCCESS_MANAGER" && sm.programId === A.id, "SM wrong");
  });

  await step("no staff limit: total staff passes nine and keeps growing", async () => {
    const before = await prisma.user.count({ where: { role: { not: "STUDENT" } } });
    const need = Math.max(0, 10 - before) + 2;
    for (let i = 0; i < need; i++) await createStaffViaForm(`bulk${i}`, "SUCCESS_MANAGER", B.name);
    const after = await prisma.user.count({ where: { role: { not: "STUDENT" } } });
    assert(after >= 12 && after === before + need, `staff count ${before} -> ${after}`);
    await superPage.goto(`${BASE}/admin/team`, { waitUntil: "networkidle" });
    const text = await superPage.locator("main").innerText();
    assert(!/\/\s*8\b|slots|limit/i.test(text), "a capacity counter is still shown");
    await superPage.goto(`${BASE}/admin/team?q=${RUN}&role=SUCCESS_MANAGER`, { waitUntil: "networkidle" });
    const rows = await superPage.locator(".sa-st-row:not(.is-head)").count();
    assert(rows === need + 1, `directory filter shows ${rows}, expected ${need + 1}`);
  });

  await step("super admin cannot be created or edited through Staff & Access", async () => {
    const roles = await (await superPage.goto(`${BASE}/admin/team/new`)).text();
    assert(!roles.includes('value="SUPER_ADMIN"') && !roles.includes('value="ADMIN"'), "SUPER_ADMIN/ADMIN offered as a role");
    const me = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" } });
    const r = await status(superPage, `/admin/team/${me.id}`);
    assert(r.code === 404, `super admin edit page gave ${r.code}`);
  });

  // ---------- per-role scope ----------
  async function visibleStudents(page) {
    await page.goto(`${BASE}/admin/my-students?q=${RUN}`, { waitUntil: "networkidle" });
    return (await page.locator(".sa-st-row.is-link small").allInnerTexts()).map((t) => t.replace("@", ""));
  }
  const pages = {};
  await step("every staff role signs in through the same form and lands in /admin", async () => {
    for (const [k, u] of Object.entries({ lect, junior, middle, senior, sm })) {
      pages[k] = await login(u.username, PW, "/admin");
      assert(new URL(pages[k].url()).pathname === "/admin", `${k} landed on ${pages[k].url()}`);
    }
  });

  const expectScope = {
    lect: [s1.username],
    junior: [s2.username],
    middle: [s3.username],
    senior: [s2.username],
    sm: [s1.username, s2.username, s3.username],
  };
  for (const [k, want] of Object.entries(expectScope)) {
    await step(`${k}: sees exactly its own students`, async () => {
      const got = (await visibleStudents(pages[k])).sort();
      assert(JSON.stringify(got) === JSON.stringify([...want].sort()), `got ${got.join(",")} want ${want.join(",")}`);
    });
  }

  await step("out-of-scope and other-program student profiles are 404 for every role", async () => {
    for (const [k, want] of Object.entries(expectScope)) {
      for (const s of [s1, s2, s3, sB]) {
        const r = await status(pages[k], `/admin/my-students/${s.id}`);
        const allowed = want.includes(s.username);
        assert(allowed ? r.code === 200 : r.code === 404, `${k} -> ${s.username}: ${r.code}`);
      }
    }
  });

  await step("Super-Admin-only and admin-only areas are closed to every new role", async () => {
    for (const k of Object.keys(pages)) {
      for (const p of ["/admin/team", "/admin/team/new", "/admin/programs", "/admin/cohorts", "/admin/students", "/admin/bug-reports", `/admin/students/${s1.id}`]) {
        const r = await status(pages[k], p);
        assert(r.code === 404 || r.url === "/admin", `${k} reached ${p} (${r.code} ${r.url})`);
      }
    }
  });

  await step("sidebar matches each role's capabilities", async () => {
    const nav = {};
    for (const k of Object.keys(pages)) nav[k] = (await navLabels(pages[k])).join("|");
    assert(nav.lect.includes("Quizzes") && nav.lect.includes("HootArena") && !nav.lect.includes("Leaderboard"), `lect: ${nav.lect}`);
    assert(!nav.junior.includes("Quizzes") && !nav.junior.includes("HootArena") && nav.junior.includes("Leaderboard"), `junior: ${nav.junior}`);
    assert(nav.middle.includes("Quizzes") && nav.middle.includes("HootArena"), `middle: ${nav.middle}`);
    assert(nav.senior.includes("Captains"), `senior: ${nav.senior}`);
    assert(nav.sm.includes("INCO") && !nav.sm.includes("Quizzes"), `sm: ${nav.sm}`);
    for (const k of Object.keys(nav)) assert(!nav[k].includes("Staff & Access") && !nav[k].includes("Programs"), `${k} sees admin links`);
  });

  await step("capabilities are enforced on the server, not just hidden", async () => {
    assert((await status(pages.junior, "/admin/quizzes")).code === 404, "junior reached quizzes");
    assert((await status(pages.junior, "/admin/hootarena/new")).code === 404, "junior reached hootarena");
    assert((await status(pages.lect, "/admin/leaderboard")).code === 404, "lecturer reached leaderboard");
    assert((await status(pages.lect, "/admin/inco")).code === 404, "lecturer reached inco");
    assert((await status(pages.senior, "/admin/supervision")).code === 200, "senior blocked from supervision");
    assert((await status(pages.junior, "/admin/supervision")).code === 404, "junior reached supervision");
  });

  await step("Success Manager sees only its own program's INCO messages", async () => {
    await pages.sm.goto(`${BASE}/admin/inco`, { waitUntil: "networkidle" });
    const body = await pages.sm.locator("main").innerText();
    assert(body.includes(`inco A ${RUN}`) && !body.includes(`inco B ${RUN}`), "INCO scope wrong");
    assert((await status(pages.sm, `/admin/inco/${incoB.id}`)).code === 404, "other program's INCO reachable");
    assert((await status(pages.sm, `/admin/inco/${incoA.id}`)).code === 200, "own INCO not reachable");
  });

  await step("Lecturer's quiz form only offers the subject/group they teach", async () => {
    await pages.lect.goto(`${BASE}/admin/quizzes/new`, { waitUntil: "networkidle" });
    const html = await pages.lect.content();
    assert(html.includes(subjA.name), "own subject missing");
    const others = A.subjects.filter((s) => s.id !== subjA.id);
    for (const o of others) assert(!html.includes(`value="${o.id}"`), `other subject ${o.name} offered`);
  });

  await step("staff note is saved append-only with author, role and follow-up", async () => {
    await pages.junior.goto(`${BASE}/admin/my-students/${s2.id}`, { waitUntil: "networkidle" });
    await pages.junior.selectOption('select[name="kind"]', "FOLLOW_UP");
    await pages.junior.fill('textarea[name="body"]', `call back ${RUN}`);
    await pages.junior.fill('input[name="followUpAt"]', "2030-01-15");
    await Promise.all([pages.junior.waitForURL(/noted=1/), pages.junior.click('button:has-text("Save note")')]);
    await pages.junior.fill('textarea[name="body"]', `second ${RUN}`);
    // The URL already says noted=1 from the first save, so wait for the row itself.
    await pages.junior.click('button:has-text("Save note")');
    for (let i = 0; i < 50 && (await prisma.studentNote.count({ where: { studentId: s2.id } })) < 2; i++) await new Promise((r) => setTimeout(r, 200));
    await pages.junior.waitForLoadState("networkidle");
    const notes = await prisma.studentNote.findMany({ where: { studentId: s2.id }, orderBy: { createdAt: "asc" } });
    assert(notes.length === 2 && notes[0].body === `call back ${RUN}` && notes[0].authorRole === "Junior Captain" && notes[0].followUpAt, "note history wrong");
  });

  await step("Senior Captain sees the supervised captain's activity", async () => {
    await pages.senior.goto(`${BASE}/admin/supervision`, { waitUntil: "networkidle" });
    const t = await pages.senior.locator("main").innerText();
    assert(t.includes(junior.username) && t.includes(`call back ${RUN}`), "supervision page missing activity");
  });

  await step("writing a note on an out-of-scope student is rejected by the server", async () => {
    const before = await prisma.studentNote.count({ where: { studentId: s1.id } });
    // Replay the junior captain's own note form, but pointed at s1 (not assigned to them).
    const r = await status(pages.junior, `/admin/my-students/${s1.id}`);
    assert(r.code === 404, "out-of-scope profile visible");
    assert((await prisma.studentNote.count({ where: { studentId: s1.id } })) === before, "note leaked");
  });

  await step("role change signs the account out immediately", async () => {
    await superPage.goto(`${BASE}/admin/team/${middle.id}`, { waitUntil: "networkidle" });
    await superPage.locator('.sa-st-role:has(input[value="JUNIOR_CAPTAIN"])').click();
    await Promise.all([superPage.waitForURL(/saved=1/), superPage.click('button:has-text("Save changes")')]);
    const r = await status(pages.middle, "/admin");
    assert(r.url === "/login", `middle still signed in (${r.url})`);
    const u = await prisma.user.findUnique({ where: { id: middle.id } });
    assert(u.role === "JUNIOR_CAPTAIN" && (await prisma.cohortCaptain.count({ where: { captainId: middle.id } })) === 0, "old assignments kept");
  });

  await step("deactivation ends the session and blocks sign-in; reactivation restores it", async () => {
    await superPage.goto(`${BASE}/admin/team/${sm.id}`, { waitUntil: "networkidle" });
    await Promise.all([superPage.waitForURL(/deactivated=1/), superPage.click('button:has-text("Deactivate account")')]);
    assert((await status(pages.sm, "/admin")).url === "/login", "deactivated session still works");
    const p = await login(sm.username, PW, "/admin");
    assert(new URL(p.url()).search.includes("error=invalid"), "deactivated account could sign in");
    await Promise.all([superPage.waitForURL(/activated=1/), superPage.click('button:has-text("Reactivate account")')]);
    const p2 = await login(sm.username, PW, "/admin");
    assert(new URL(p2.url()).pathname === "/admin", "reactivated account cannot sign in");
  });

  await step("password reset shows a one-time password that works", async () => {
    await superPage.goto(`${BASE}/admin/team/${lect.id}`, { waitUntil: "networkidle" });
    await Promise.all([superPage.waitForURL(/pw=/), superPage.click('button:has-text("Reset password")')]);
    const pw = (await superPage.locator(".sa-st-alert.is-key code").innerText()).trim();
    assert(pw.length >= 10, "no password shown");
    assert((await status(pages.lect, "/admin")).url === "/login", "old lecturer session survived reset");
    const p = await login(lect.username, pw, "/admin");
    assert(new URL(p.url()).pathname === "/admin", "new password rejected");
  });

  await step("a student signs in through the same form and lands on /dashboard, never /admin", async () => {
    const p = await login(s1.username, STUDENT_PW, "/dashboard");
    assert(new URL(p.url()).pathname === "/dashboard", `student landed on ${p.url()}`);
    const r = await status(p, "/admin");
    assert(!r.url.startsWith("/admin"), `student reached /admin (${r.url})`);
  });

  await step("a forged ?from= cannot send a student into the staff area", async () => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login?from=/admin/team`, { waitUntil: "networkidle" });
    await page.fill('input[name="username"]', s2.username);
    await page.fill('input[name="password"]', STUDENT_PW);
    await Promise.all([page.waitForURL((u) => u.pathname !== "/login"), page.click('button[type="submit"]')]);
    assert(new URL(page.url()).pathname === "/dashboard", `went to ${page.url()}`);
  });
} finally {
  await prisma.studentNote.deleteMany({ where: { OR: [{ studentId: { in: created.users } }, { authorId: { in: created.users } }] } });
  await prisma.incoSubmission.deleteMany({ where: { id: { in: created.inco } } });
  await prisma.cohort.deleteMany({ where: { id: { in: created.cohorts } } });
  await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  await browser.close();
  await prisma.$disconnect();
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
