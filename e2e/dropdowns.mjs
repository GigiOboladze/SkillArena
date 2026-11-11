// E2E coverage for the SkillArena Select (src/components/ui/Select.tsx) on
// EVERY page that has a dropdown, for every role that uses one.
//
// On each page, every dropdown is found automatically (.sa-select-trigger)
// and, one at a time:
//   - opened by mouse: the menu renders with the SkillArena menu design
//     (#100B1D background in dark mode, white in light mode), sits inside the
//     viewport, and the current option is marked selected with a checkmark;
//   - closed with Escape, focus returning to the trigger;
//   - used to pick a different option, which must reach the real form field
//     (the trigger shows it afterwards; auto-submit filters navigate).
// Plus: full keyboard selection, `required` validation, staff directory page
// 2 (pagination), light mode and a phone viewport.
// Creates its own fixtures and removes them. Local/dev database only.
// Run: node --import tsx e2e/dropdowns.mjs
import "dotenv/config";
import { chromium } from "playwright";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { hashPassword } from "../src/lib/password.ts";

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const SUPER = { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD };
const results = [];
const ok = (n) => { results.push({ pass: true }); console.log("PASS:", n); };
const fail = (n, e) => { results.push({ pass: false }); console.log("FAIL:", n, "-", e?.message ?? e); };
const assert = (c, m) => { if (!c) throw new Error(m); };
async function step(name, fn) { try { await fn(); ok(name); } catch (e) { fail(name, e); } }

const prisma = new PrismaClient();
const browser = await chromium.launch();
const RUN = Date.now().toString(36);
const PW = "dropdown-pass-123";
const ids = { users: [], quizzes: [], games: [], bugs: [] };

// ---------------- fixtures ----------------
const [A] = await prisma.program.findMany({ orderBy: { order: "asc" }, include: { subjects: { include: { groups: true } } } });
const subj = A.subjects.find((s) => s.groups.length > 0);
const hash = await hashPassword(PW);
async function mkUser(tag, role, extra = {}) {
  const u = await prisma.user.create({ data: { firstName: `Dd${tag}`, lastName: RUN, username: `e2e-dd-${tag}-${RUN}`, passwordHash: hash, role, programId: A.id, ...extra } });
  ids.users.push(u.id);
  return u;
}
const student = await mkUser("stu", "STUDENT", { subjectGroups: { create: { subjectId: subj.id, groupId: subj.groups[0].id } } });
const lect = await mkUser("lect", "LECTURER");
await prisma.lecturerAssignment.create({ data: { userId: lect.id, subjectId: subj.id, groupId: subj.groups[0].id } });
const junior = await mkUser("jun", "JUNIOR_CAPTAIN");
await prisma.captainStudent.create({ data: { captainId: junior.id, studentId: student.id } });
const middle = await mkUser("mid", "MIDDLE_CAPTAIN");
const sm = await mkUser("sm", "SUCCESS_MANAGER");
const senior = await mkUser("sen", "SENIOR_CAPTAIN");
await prisma.captainSupervision.create({ data: { seniorId: senior.id, captainId: junior.id } });
const superUser = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" } });
const quiz = await prisma.homework.create({ data: { title: `Dropdown quiz ${RUN}`, mode: "QUIZ", joinCode: `DD${RUN}`.slice(0, 12), ownerUserId: lect.id, subjectId: subj.id, targetGroups: { create: { groupId: subj.groups[0].id } } } });
ids.quizzes.push(quiz.id);
const game = await prisma.hootGame.create({ data: { title: `Dropdown game ${RUN}`, pin: String(Date.now()).slice(-6), hostId: superUser.id } });
ids.games.push(game.id);
const bug = await prisma.bugReport.create({ data: { studentId: student.id, description: `Dropdown bug ${RUN}` } });
ids.bugs.push(bug.id);
// Enough extra staff that the Staff & Access directory has a page 2.
const filler = await prisma.user.count({ where: { role: { not: "STUDENT" } } });
for (let i = 0; i < Math.max(0, 27 - filler); i++) await mkUser(`fill${i}`, "SUCCESS_MANAGER");

async function login(username, password, home, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport ?? { width: 1440, height: 900 } });
  if (opts.theme) await ctx.addInitScript((t) => localStorage.setItem("skillarena-theme", t), opts.theme);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL(`${BASE}${home}`), page.click('button[type="submit"]')]);
  return page;
}

const triggers = (page) => page.locator("main .sa-select-trigger");

/** Opens the n-th dropdown, checks design/position/selection, closes with Escape, then picks another option. */
async function exerciseDropdown(page, url, n, { theme = "dark" } = {}) {
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
  const trig = triggers(page).nth(n);
  // Some dropdowns live in a collapsed <details> (quiz settings, "Post as"
  // pop-overs) - open it the way a user would before using the dropdown.
  if (!(await trig.isVisible())) {
    await trig.evaluate((el) => { for (let d = el.closest("details"); d; d = d.parentElement?.closest("details") ?? null) d.open = true; });
  }
  await trig.scrollIntoViewIfNeeded();
  const label = (await trig.getAttribute("aria-label")) || (await trig.innerText()).trim();
  assert((await trig.getAttribute("aria-haspopup")) === "listbox", `${label}: trigger is not a listbox button`);
  // The real field is still in the form, right after its trigger.
  const native = trig.locator("xpath=following-sibling::select[1]");
  assert((await native.count()) === 1, `${label}: hidden form field missing`);

  await trig.click();
  const menu = page.locator(".sa-dropdown");
  await menu.waitFor({ state: "visible" });
  const bg = await menu.evaluate((e) => getComputedStyle(e).backgroundColor);
  const want = theme === "dark" ? "rgb(16, 11, 29)" : "rgb(255, 255, 255)";
  assert(bg === want, `${label}: menu background ${bg}, want ${want}`);
  const box = await menu.boundingBox();
  const vp = page.viewportSize();
  assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width + 0.5 && box.y + box.height <= vp.height + 0.5, `${label}: menu outside viewport ${JSON.stringify(box)}`);
  const selectedCount = await menu.locator('[role="option"][aria-selected="true"]').count();
  const nativeVal = await native.inputValue();
  if (nativeVal !== "") {
    assert(selectedCount === 1, `${label}: expected one selected option, got ${selectedCount}`);
    assert((await menu.locator('[aria-selected="true"] .sa-dropdown-check').count()) === 1, `${label}: no checkmark on selected option`);
  }
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "detached" });
  assert(await trig.evaluate((el) => el === document.activeElement), `${label}: focus did not return to the trigger`);

  // Pick a different option with the mouse.
  await trig.click();
  const other = page.locator('.sa-dropdown [role="option"]:not([aria-selected="true"]):not([aria-disabled="true"])').first();
  if ((await other.count()) === 0) { await page.keyboard.press("Escape"); return `${label} (single option)`; }
  const pick = (await other.innerText()).trim();
  const before = page.url();
  await other.click();
  await page.waitForLoadState("networkidle");
  if (page.url() !== before) {
    // Auto-submit filter: the page reloaded with the choice applied.
    const again = triggers(page).nth(n);
    assert((await again.innerText()).trim() === pick, `${label}: after navigation shows "${(await again.innerText()).trim()}", want "${pick}"`);
  } else {
    assert((await trig.innerText()).trim() === pick, `${label}: trigger shows "${(await trig.innerText()).trim()}", want "${pick}"`);
    const val = await native.inputValue();
    const optText = await native.locator(`option[value="${val.replace(/"/g, '\\"')}"]`).first().innerText();
    assert(optText.trim() === pick, `${label}: form field holds "${optText.trim()}", want "${pick}"`);
  }
  return label;
}

async function coverPage(page, url, role, expectAtLeast = 1, opts) {
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
  const n = await triggers(page).count();
  await step(`${role} ${url}: ${n} dropdown(s) found`, async () => {
    assert(n >= expectAtLeast, `expected at least ${expectAtLeast}, found ${n}`);
    assert((await page.locator("main select:not(.sa-select-native)").count()) === 0, "a bare native <select> is still rendered");
  });
  for (let i = 0; i < n; i++) {
    await step(`${role} ${url}: dropdown ${i + 1}/${n} opens, closes and selects`, async () => {
      await exerciseDropdown(page, url, i, opts);
    });
  }
}

try {
  // ---------------- Super Admin: every admin area ----------------
  const sa = await login(SUPER.username, SUPER.password, "/admin");
  const saPages = [
    ["/admin/team", 3],
    ["/admin/team?page=2", 3],
    ["/admin/team/new", 1],
    [`/admin/team/${lect.id}`, 1],
    [`/admin/quizzes?program=${A.id}`, 2],
    [`/admin/quizzes/new?program=${A.id}`, 1],
    [`/admin/quizzes/${quiz.id}`, 1],
    [`/admin/students?program=${A.id}`, 2],
    [`/admin/students/new?program=${A.id}`, 1],
    [`/admin/students/${student.id}`, 2],
    ["/admin/bug-reports", 2],
    ["/admin/bug-reports/new", 1],
    [`/admin/bug-reports/${bug.id}`, 2],
    ["/admin/hootarena", 3],
    [`/admin/hootarena/${game.id}/questions/new`, 1],
    ["/admin/leaderboard", 1],
  ];
  for (const [url, min] of saPages) await coverPage(sa, url, "super admin", min);

  await step("staff directory page 2 is real pagination", async () => {
    await sa.goto(`${BASE}/admin/team?page=2`, { waitUntil: "networkidle" });
    assert((await sa.locator(".sa-st-pager").innerText()).includes("Page 2"), "page 2 not reached");
  });

  await step("keyboard: ArrowDown opens, arrows move, Enter selects, Tab/Escape close", async () => {
    await sa.goto(`${BASE}/admin/team/new`, { waitUntil: "networkidle" });
    const trig = triggers(sa).first();
    const start = (await trig.innerText()).trim();
    await trig.focus();
    await sa.keyboard.press("ArrowDown");
    await sa.locator(".sa-dropdown").waitFor();
    assert((await sa.locator(".sa-dropdown").getAttribute("aria-activedescendant")) !== null, "no active option");
    await sa.keyboard.press("ArrowDown");
    await sa.keyboard.press("Enter");
    await sa.locator(".sa-dropdown").waitFor({ state: "detached" });
    const after = (await trig.innerText()).trim();
    assert(after !== start, `Enter did not change the value (${start})`);
    await sa.keyboard.press(" ");
    await sa.locator(".sa-dropdown").waitFor();
    await sa.keyboard.press("Tab");
    await sa.locator(".sa-dropdown").waitFor({ state: "detached" });
  });

  await step("required dropdown left empty: form is blocked and the menu opens on it", async () => {
    await sa.goto(`${BASE}/admin/quizzes/new?program=${A.id}`, { waitUntil: "networkidle" });
    await sa.fill('input[name="title"]', `never-created ${RUN}`);
    const before = sa.url();
    await sa.locator("main form").getByRole("button", { name: /create/i }).first().click();
    await sa.locator(".sa-dropdown").waitFor({ timeout: 5000 });
    assert(sa.url() === before, "form submitted without a subject");
    const invalid = sa.locator('main .sa-select-trigger[data-invalid="true"]');
    assert((await invalid.count()) === 1, "required subject dropdown not marked invalid");
    assert((await invalid.locator("xpath=following-sibling::select[1]").getAttribute("name")) === "subjectId", "wrong dropdown marked invalid");
    assert((await prisma.homework.count({ where: { title: `never-created ${RUN}` } })) === 0, "quiz was created");
  });

  await step("filter dropdown still drives the URL filter (bug reports status)", async () => {
    await sa.goto(`${BASE}/admin/bug-reports`, { waitUntil: "networkidle" });
    await sa.getByRole("button", { name: "Filter by status" }).click();
    await Promise.all([sa.waitForURL(/status=OPEN/), sa.locator(".sa-dropdown").getByRole("option", { name: "Open", exact: true }).click()]);
  });

  // ---------------- Light mode + phone ----------------
  const light = await login(SUPER.username, SUPER.password, "/admin", { theme: "light" });
  for (const url of ["/admin/team", "/admin/bug-reports", `/admin/students/${student.id}`]) await coverPage(light, url, "super admin (light)", 1, { theme: "light" });
  const phone = await login(SUPER.username, SUPER.password, "/admin", { viewport: { width: 390, height: 844 } });
  for (const url of ["/admin/team", "/admin/team/new", "/admin/hootarena", `/admin/quizzes/${quiz.id}`]) await coverPage(phone, url, "super admin (phone)");

  // ---------------- Other staff roles ----------------
  const lp = await login(lect.username, PW, "/admin");
  for (const [url, min] of [["/admin/quizzes", 2], ["/admin/quizzes/new", 1], [`/admin/quizzes/${quiz.id}`, 1], [`/admin/my-students/${student.id}`, 1]]) await coverPage(lp, url, "lecturer", min);
  const jp = await login(junior.username, PW, "/admin");
  await coverPage(jp, `/admin/my-students/${student.id}`, "junior captain");
  const mp = await login(middle.username, PW, "/admin");
  for (const [url, min] of [["/admin/quizzes", 1], ["/admin/quizzes/new", 1], ["/admin/hootarena", 2]]) await coverPage(mp, url, "middle captain", min);
  const sp = await login(senior.username, PW, "/admin");
  for (const [url, min] of [[`/admin/my-students/${student.id}`, 1], ["/admin/quizzes/new", 1]]) await coverPage(sp, url, "senior captain", min);
  const smp = await login(sm.username, PW, "/admin");
  await coverPage(smp, `/admin/my-students/${student.id}`, "success manager");

  // ---------------- Student ----------------
  const st = await login(student.username, PW, "/dashboard");
  await coverPage(st, "/dashboard/inco", "student");
} finally {
  await prisma.studentNote.deleteMany({ where: { studentId: { in: ids.users } } });
  await prisma.bugReport.deleteMany({ where: { id: { in: ids.bugs } } });
  await prisma.hootGame.deleteMany({ where: { id: { in: ids.games } } });
  await prisma.homework.deleteMany({ where: { OR: [{ id: { in: ids.quizzes } }, { ownerUserId: { in: ids.users } }] } });
  await prisma.hootGame.deleteMany({ where: { hostId: { in: ids.users } } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  await browser.close();
  await prisma.$disconnect();
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
