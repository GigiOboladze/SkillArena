// Regression suite for the security and correctness fixes applied during the
// 2026-11 audit. Every check here corresponds to a defect that was confirmed
// by code reading and had NO test coverage - the existing suites only ever
// exercised paths the UI itself produces, which is precisely why this class of
// bug survived ~150 passing checks.
//
// Needs the Super Admin (ADMIN_USERNAME/ADMIN_PASSWORD from .env) and a
// running app. Creates its own throwaway homeworks/quizzes/students/games and
// cleans them up. Safe against a local/dev database only.
// Run: npm run test:e2e:security
import "dotenv/config";
import { chromium } from "playwright";
import { io } from "socket.io-client";
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

const prisma = new PrismaClient();
const browser = await chromium.launch();
const main = (p) => p.locator("main");
const RUN_ID = Date.now();
const createdUsernames = [];
const createdHomeworkIds = [];
// Snapshots of credentials this suite temporarily overwrites so it can log in
// as an existing fixture account. Restored in the finally block - other suites
// authenticate as these same accounts with their own documented passwords.
let restoreAdminPassword = null;
let restoreStudentPassword = null;

async function adminLogin() {
  const page = await browser.newPage();
  await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="username"]', ADMIN_USERNAME);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await Promise.all([page.waitForURL(`${BASE}/admin`), page.click('button[type="submit"]')]);
  // The dashboard/admin areas stream behind a loading skeleton; wait for the real content.
  await page.locator('[aria-busy="true"]').waitFor({ state: "detached" });
  return page;
}

async function sessionCookieHeader(page) {
  const cookies = await page.context().cookies();
  const session = cookies.find((c) => c.name === "__session");
  if (!session) throw new Error("no __session cookie on this context");
  return `__session=${session.value}`;
}

/** Creates a LIVE homework through the public no-login flow and returns its id. */
async function createLiveHomework(page, title) {
  await page.goto(`${BASE}/homeworks/new`, { waitUntil: "networkidle" });
  await page.fill('input[name="title"]', title);
  await page.locator('input[name="mode"][value="LIVE"]').check();
  await Promise.all([
    page.waitForURL((u) => /\/homeworks\/[a-z0-9]+$/.test(u.pathname) && !u.pathname.endsWith("/new")),
    main(page).locator('button[type="submit"]').click(),
  ]);
  const id = new URL(page.url()).pathname.split("/").pop();
  createdHomeworkIds.push(id);

  // One question, so the homework is startable.
  await page.goto(`${BASE}/homeworks/${id}/questions/new`, { waitUntil: "networkidle" });
  await main(page).locator('textarea[name="text"]').fill("Regression question?");
  await main(page).locator('input[name="opt1"]').fill("A");
  await main(page).locator('input[name="opt2"]').fill("B");
  await main(page).locator('input[name="correct"][value="1"]').check();
  await Promise.all([
    page.waitForURL(`${BASE}/homeworks/${id}`),
    main(page).locator('button[type="submit"]').click(),
  ]);
  await page.goto(`${BASE}/homeworks/${id}`, { waitUntil: "networkidle" });
  await main(page).getByRole("button", { name: "Open", exact: true }).click();
  await page.waitForLoadState("networkidle");
  return id;
}

async function run() {
  const admin = await adminLogin();
  ok("super admin login");

  // ===================================================================
  // S3 - legacy LIVE host events must act only on the homework this
  // socket authenticated as host for. Previously they trusted the
  // homeworkId in the event payload, so a legitimately-authorized host of
  // ANY homework could drive, finish, or (via host:restart, which deletes
  // every submitted answer) wipe an unrelated one.
  // ===================================================================
  const hwA = await createLiveHomework(admin, `E2E SEC A ${RUN_ID}`);
  const hwB = await createLiveHomework(admin, `E2E SEC B ${RUN_ID}`);
  ok(`created two LIVE homeworks (${hwA}, ${hwB})`);

  const cookie = await sessionCookieHeader(admin);
  const sock = io(BASE, { path: "/socket.io", extraHeaders: { Cookie: cookie }, transports: ["websocket"] });
  await new Promise((resolve, reject) => {
    sock.on("connect", resolve);
    sock.on("connect_error", reject);
    setTimeout(() => reject(new Error("socket connect timeout")), 10000);
  });

  const joined = await new Promise((resolve) => sock.emit("host:join", { homeworkId: hwA }, (okFlag) => resolve(okFlag)));
  await assert(joined === true, "admin should be authorized to host homework A");
  ok("socket authenticated as host of homework A");

  // Attack: authorized for A, but target B.
  sock.emit("host:start", { homeworkId: hwB });
  await new Promise((r) => setTimeout(r, 1200));
  const bAfterStart = await prisma.homework.findUnique({ where: { id: hwB }, select: { livePhase: true } });
  await assert(
    bAfterStart.livePhase === "LOBBY",
    `host:start for a non-authorized homework must be ignored (B.livePhase=${bAfterStart.livePhase})`
  );
  ok("host:start targeting another homework is ignored (cross-game control blocked)");

  // The destructive one: host:restart deletes every Answer for the homework.
  const liveQuestionB = await prisma.question.findFirst({ where: { homeworkId: hwB }, select: { id: true } });
  const victimStudent = await prisma.student.create({
    data: { homeworkId: hwB, firstName: "Victim", lastName: "Answer", clientToken: `sec-victim-${RUN_ID}` },
  });
  await prisma.answer.create({
    data: { studentId: victimStudent.id, questionId: liveQuestionB.id, isCorrect: true, pointsAwarded: 500 },
  });
  const answersBefore = await prisma.answer.count({ where: { question: { homeworkId: hwB } } });
  await assert(answersBefore === 1, "fixture: homework B should have exactly one answer");

  sock.emit("host:restart", { homeworkId: hwB });
  await new Promise((r) => setTimeout(r, 1200));
  const answersAfter = await prisma.answer.count({ where: { question: { homeworkId: hwB } } });
  await assert(
    answersAfter === 1,
    `host:restart for a non-authorized homework must NOT delete its answers (before=${answersBefore}, after=${answersAfter})`
  );
  ok("host:restart targeting another homework does not wipe its answers (destructive action blocked)");

  // Sanity: the same socket CAN still control the homework it owns, so the
  // fix did not break legitimate hosting.
  sock.emit("host:start", { homeworkId: hwA });
  await new Promise((r) => setTimeout(r, 1500));
  const aAfterStart = await prisma.homework.findUnique({ where: { id: hwA }, select: { livePhase: true } });
  await assert(
    aAfterStart.livePhase === "QUESTION",
    `legitimate host:start must still work (A.livePhase=${aAfterStart.livePhase})`
  );
  ok("legitimate hosting still works (fix is not over-broad)");
  sock.emit("host:end", { homeworkId: hwA });
  await new Promise((r) => setTimeout(r, 600));
  sock.close();

  // ===================================================================
  // S6 - a generated password must never appear in the URL.
  // ===================================================================
  const pwUser = `e2e-sec-pw-${RUN_ID}`;
  createdUsernames.push(pwUser);
  await admin.goto(`${BASE}/admin/students/new`, { waitUntil: "networkidle" });
  await main(admin).locator('input[name="firstName"]').fill("Pw");
  await main(admin).locator('input[name="lastName"]').fill("Flash");
  await main(admin).locator('input[name="username"]').fill(pwUser);
  await Promise.all([
    admin.waitForURL((u) => u.searchParams.get("created") === pwUser),
    main(admin).getByRole("button", { name: "Create student" }).click(),
  ]);
  const createdUrl = new URL(admin.url());
  await assert(createdUrl.searchParams.get("password") === null, "the plaintext password must not be a query param");
  await assert(!!createdUrl.searchParams.get("pw"), "an opaque flash token should be present instead");
  const credentialBlock = await main(admin).getByText("Credentials for").isVisible();
  await assert(credentialBlock, "the credentials block must still be shown to the admin");
  const shownPassword = await main(admin).locator("span.font-mono.text-rahoot-ink").first().textContent();
  await assert(
    !!shownPassword && shownPassword.trim().length >= 8,
    `the generated password must still be displayed (got "${shownPassword}")`
  );
  await assert(
    !createdUrl.search.includes(shownPassword.trim()),
    "the displayed password must not appear anywhere in the URL"
  );
  ok("generated password is shown on the page but never placed in the URL");

  // The flash token is opaque and single-purpose: a different token reveals nothing.
  await admin.goto(`${BASE}/admin/students?created=${pwUser}&pw=not-a-real-token`, { waitUntil: "networkidle" });
  const bogusVisible = await main(admin).getByText("Credentials for").isVisible().catch(() => false);
  await assert(!bogusVisible, "an unknown flash token must not reveal any credential block");
  ok("an unknown/forged flash token reveals nothing");

  // ===================================================================
  // S5 - login throttling. Uses a username that does not exist, so no real
  // account is ever locked out by this test.
  // ===================================================================
  const throttleUser = `e2e-sec-nobody-${RUN_ID}`;
  const throttlePage = await browser.newPage();
  let sawThrottle = false;
  for (let i = 0; i < 12; i++) {
    await throttlePage.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await throttlePage.fill('input[name="username"]', throttleUser);
    await throttlePage.fill('input[name="password"]', `wrong-${i}`);
    await throttlePage.click('button[type="submit"]');
    await throttlePage.waitForURL(/error=/);
    if (new URL(throttlePage.url()).searchParams.get("error") === "throttled") { sawThrottle = true; break; }
  }
  await assert(sawThrottle, "repeated failed logins for one username must eventually be throttled");
  ok("repeated failed logins are throttled (brute-force + scrypt CPU-DoS surface closed)");

  const throttleMessage = await throttlePage.getByText(/Too many login attempts/i).isVisible();
  await assert(throttleMessage, "the throttled state must be explained to the user");
  ok("throttled login shows a clear message rather than 'incorrect password'");
  await throttlePage.close();

  // ===================================================================
  // F3 - HootArena question `order` must not collide after a middle delete.
  // Previously order=count(), so {0,2} + count 2 produced a duplicate
  // order: 2 and violated @@unique([gameId, order]) with an unhandled P2002.
  // ===================================================================
  await admin.goto(`${BASE}/admin/hootarena/new`, { waitUntil: "networkidle" });
  await admin.fill('input[name="title"]', `E2E SEC Hoot ${RUN_ID}`);
  await Promise.all([
    admin.waitForURL((u) => /\/admin\/hootarena\/[a-z0-9]+$/.test(u.pathname) && !u.pathname.endsWith("/new")),
    main(admin).locator('button[type="submit"]').click(),
  ]);
  const gameId = new URL(admin.url()).pathname.split("/").pop();

  // All four option inputs are `required` in HootQuestionForm's default
  // (optionCount starts at 4), so every one must be filled.
  async function addHootQuestion(label) {
    await admin.goto(`${BASE}/admin/hootarena/${gameId}/questions/new`, { waitUntil: "networkidle" });
    await main(admin).locator('textarea[name="text"]').fill(label);
    for (const [i, text] of ["A", "B", "C", "D"].entries()) {
      await main(admin).locator(`input[name="opt${i + 1}"]`).fill(text);
    }
    await main(admin).locator('input[name="correct"][value="1"]').first().check();
    await Promise.all([
      admin.waitForURL(`${BASE}/admin/hootarena/${gameId}`),
      main(admin).getByRole("button", { name: "Add question" }).click(),
    ]);
  }
  await addHootQuestion("Q one");
  await addHootQuestion("Q two");
  await addHootQuestion("Q three");
  let orders = (await prisma.hootQuestion.findMany({ where: { gameId }, select: { order: true }, orderBy: { order: "asc" } })).map((q) => q.order);
  await assert(JSON.stringify(orders) === "[0,1,2]", `fixture: expected orders [0,1,2], got ${JSON.stringify(orders)}`);

  // Delete the MIDDLE question through the real admin UI (so the actual
  // deleteHootQuestion action runs, including its new parent-scoping guard),
  // leaving a gap at order 1.
  await admin.goto(`${BASE}/admin/hootarena/${gameId}`, { waitUntil: "networkidle" });
  const middleRow = main(admin).locator("li").filter({ hasText: "Q two" });
  await middleRow.getByRole("button", { name: "Delete" }).click();
  // The action redirects back to this same URL, so waitForURL would resolve
  // instantly - wait for the row itself to disappear instead.
  await middleRow.waitFor({ state: "detached", timeout: 30000 });
  orders = (await prisma.hootQuestion.findMany({ where: { gameId }, select: { order: true }, orderBy: { order: "asc" } })).map((q) => q.order);
  await assert(JSON.stringify(orders) === "[0,2]", `after deleting the middle question expected orders [0,2], got ${JSON.stringify(orders)}`);
  ok("deleting a middle HootArena question works and leaves a gap in `order`");

  // The previously-crashing step: adding a question while a gap is present.
  await addHootQuestion("Q four");
  orders = (await prisma.hootQuestion.findMany({ where: { gameId }, select: { order: true }, orderBy: { order: "asc" } })).map((q) => q.order);
  const unique = new Set(orders).size === orders.length;
  await assert(unique, `question orders must stay unique after a middle delete, got ${JSON.stringify(orders)}`);
  await assert(orders.length === 3, `expected 3 questions, got ${orders.length}`);
  ok(`adding a question after deleting a middle one no longer collides (orders ${JSON.stringify(orders)})`);

  await prisma.hootGame.delete({ where: { id: gameId } });

  // ===================================================================
  // F1 - an in-progress attempt must be reachable from the dashboard.
  // ===================================================================
  const inProgress = await prisma.quizAttempt.findFirst({
    where: { status: "IN_PROGRESS" },
    include: { student: { select: { username: true } }, homework: { select: { title: true, status: true } } },
  });
  if (!inProgress) {
    ok("SKIPPED: no IN_PROGRESS attempt in this database to verify the dashboard resume card");
  } else {
    // Give the student a known password so this test can log in as them,
    // snapshotting the original so it can be put back afterwards.
    const originalStudent = await prisma.user.findUniqueOrThrow({
      where: { id: inProgress.studentId },
      select: { passwordHash: true, sessionVersion: true },
    });
    restoreStudentPassword = { id: inProgress.studentId, ...originalStudent };

    const { hashPassword } = await import("../src/lib/password.ts");
    const tempHash = await hashPassword("e2e-resume-pass-123456");
    await prisma.user.update({ where: { id: inProgress.studentId }, data: { passwordHash: tempHash, sessionVersion: { increment: 1 } } });

    const stu = await browser.newPage();
    await stu.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await stu.fill('input[name="username"]', inProgress.student.username);
    await stu.fill('input[name="password"]', "e2e-resume-pass-123456");
    await Promise.all([stu.waitForURL(`${BASE}/dashboard`), stu.click('button[type="submit"]')]);
    // The dashboard/admin areas stream behind a loading skeleton; wait for the real content.
    await stu.locator('[aria-busy="true"]').waitFor({ state: "detached" });
    // The dashboard now streams behind a loading.tsx skeleton, so waiting on
    // the URL alone can assert against the placeholder. Wait for real content.
    await main(stu).getByRole("heading", { name: /Welcome back/i }).waitFor({ timeout: 30000 });

    const resumeHeading = await main(stu).getByText("Continue where you left off").isVisible();
    await assert(resumeHeading, "the dashboard must surface a section for in-progress attempts");
    const resumeLink = main(stu).locator(`a[href="/quiz/${inProgress.homeworkId}"]`);
    await assert(await resumeLink.count() > 0, "the in-progress quiz must link back to its start/resume page");
    ok("an in-progress attempt is reachable from the dashboard (was previously orphaned)");
    await stu.close();
  }

  // ===================================================================
  // F2 - score must never exceed totalQuestions.
  // ===================================================================
  const finished = await prisma.quizAttempt.findMany({
    where: { status: { in: ["COMPLETED", "FAILED"] } },
    select: { id: true, score: true, totalQuestions: true },
  });
  const inconsistent = finished.filter((a) => a.score > a.totalQuestions);
  await assert(
    inconsistent.length === 0,
    `${inconsistent.length} finished attempt(s) store score > totalQuestions, e.g. ${JSON.stringify(inconsistent[0] ?? null)}`
  );
  ok(`no finished attempt stores a score greater than its totalQuestions (checked ${finished.length})`);

  // ===================================================================
  // S4 - the attempt-detail page must enforce the viewing admin's program.
  // Verified against a regular (non-super) Admin if one exists.
  // ===================================================================
  // Search EVERY regular Admin for one that has an out-of-program attempt
  // available, rather than just the first - otherwise this check silently
  // skips whenever the first admin happens to own all the data.
  const regularAdmins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true, username: true, programId: true },
  });
  let regularAdmin = null;
  let foreignAttempt = null;
  for (const candidate of regularAdmins) {
    const attempt = await prisma.quizAttempt.findFirst({
      where: { student: { role: "STUDENT", programId: { not: candidate.programId } } },
      select: { id: true, studentId: true },
    });
    if (attempt) { regularAdmin = candidate; foreignAttempt = attempt; break; }
  }

  if (!regularAdmin || !foreignAttempt) {
    ok("SKIPPED: no regular Admin + out-of-program attempt pair available to verify the attempt-detail program guard");
  } else {
    // This check needs to log in AS that admin, which means temporarily
    // setting a known password. Snapshot the original hash first and restore
    // it in the finally block below - other suites (program-isolation,
    // group-count) log in as these same fixture admins with their documented
    // passwords, and leaving a changed hash behind breaks them.
    const original = await prisma.user.findUniqueOrThrow({
      where: { id: regularAdmin.id },
      select: { passwordHash: true, sessionVersion: true },
    });
    restoreAdminPassword = { id: regularAdmin.id, ...original };

    const tempPw = `e2e-sec-admin-${RUN_ID}`;
    const { hashPassword } = await import("../src/lib/password.ts");
    await prisma.user.update({ where: { id: regularAdmin.id }, data: { passwordHash: await hashPassword(tempPw), sessionVersion: { increment: 1 } } });

    const ra = await browser.newPage();
    await ra.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
    await ra.fill('input[name="username"]', regularAdmin.username);
    await ra.fill('input[name="password"]', tempPw);
    await Promise.all([ra.waitForURL(`${BASE}/admin`), ra.click('button[type="submit"]')]);
    // The dashboard/admin areas stream behind a loading skeleton; wait for the real content.
    await ra.locator('[aria-busy="true"]').waitFor({ state: "detached" });

    const res = await ra.goto(
      `${BASE}/admin/students/${foreignAttempt.studentId}/attempts/${foreignAttempt.id}`,
      { waitUntil: "networkidle" }
    );
    const status = res?.status() ?? 0;
    const body = await ra.locator("body").innerText();
    const blocked = status === 404 || /not found/i.test(body);
    await assert(blocked, `a regular Admin must not read another program's attempt sheet (status ${status})`);
    ok("attempt-detail page blocks a cross-program admin (404), closing the leak");
    await ra.close();
  }

  // ===================================================================
  // R1 - a branded 404 exists instead of Next's default page.
  // ===================================================================
  const nf = await browser.newPage();
  const nfRes = await nf.goto(`${BASE}/definitely-not-a-real-route-${RUN_ID}`, { waitUntil: "networkidle" });
  await assert(nfRes?.status() === 404, "an unknown route should return 404");
  const nfText = await nf.locator("body").innerText();
  await assert(/Not found/i.test(nfText), "the 404 page should render the branded not-found content");
  await assert(
    /don't have access|doesn't exist/i.test(nfText.replace(/[‘’]/g, "'")),
    "the 404 copy should be deliberately ambiguous about whether the resource exists"
  );
  ok("unknown routes render the branded 404 page");
  await nf.close();

  // ===================================================================
  // Security headers.
  // ===================================================================
  const hdrPage = await browser.newPage();
  const hdrRes = await hdrPage.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  const headers = hdrRes?.headers() ?? {};
  await assert(headers["referrer-policy"] === "strict-origin-when-cross-origin", `missing/incorrect Referrer-Policy: ${headers["referrer-policy"]}`);
  await assert(headers["x-frame-options"] === "DENY", `missing/incorrect X-Frame-Options: ${headers["x-frame-options"]}`);
  await assert(headers["x-content-type-options"] === "nosniff", `missing/incorrect X-Content-Type-Options: ${headers["x-content-type-options"]}`);
  ok("security response headers are present (Referrer-Policy, X-Frame-Options, nosniff)");
  await hdrPage.close();

  await admin.close();
}

try {
  await run();
} catch (err) {
  fail("suite aborted", err?.stack || err);
} finally {
  // ---------- cleanup ----------
  try {
    for (const id of createdHomeworkIds) {
      await prisma.homework.delete({ where: { id } }).catch(() => {});
    }
    for (const username of createdUsernames) {
      await prisma.user.deleteMany({ where: { username } }).catch(() => {});
    }
    // Put back any credential this suite temporarily overwrote, so the other
    // suites can still authenticate as these fixture accounts.
    for (const snap of [restoreAdminPassword, restoreStudentPassword]) {
      if (!snap) continue;
      await prisma.user
        .update({ where: { id: snap.id }, data: { passwordHash: snap.passwordHash, sessionVersion: snap.sessionVersion } })
        .catch(() => {});
    }
    const restored = [restoreAdminPassword, restoreStudentPassword].filter(Boolean).length;
    console.log(`\nCleaned up ${createdHomeworkIds.length} homework(s), ${createdUsernames.length} student(s); restored ${restored} credential snapshot(s).`);
  } catch (err) {
    console.log("cleanup warning:", err?.message ?? err);
  }
  await prisma.$disconnect().catch(() => {});
  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("FAILURES:");
    for (const f of failed) console.log(" -", f.name, "::", f.err);
    process.exitCode = 1;
  }
}
