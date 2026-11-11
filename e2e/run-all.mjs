// Runs every e2e suite in sequence and exits non-zero if any of them failed,
// so the whole regression suite is one command with one exit code. Previously
// each suite had its own npm script and had to be run (and judged) by hand,
// which made "is the app green?" a manual, easy-to-skip question.
//
// Ordering is deliberate: the pure unit tests run first (fast, no server
// needed), then the suites that create and clean up their own fixtures.
//
// Requires a running app at SMOKE_BASE_URL (default http://localhost:3000) and
// a reachable database. Safe against a local/dev database only - these suites
// create and delete real rows.
//
// Run: npm run test:all
import "dotenv/config";
import { spawn } from "node:child_process";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const SUITES = [
  // label,                     file
  ["hootarena scoring (unit)", "e2e/hootarena-scoring.mjs"],
  ["smoke (legacy LIVE/ASYNC)", "e2e/smoke.mjs"],
  ["skillarena quiz flow", "e2e/skillarena.mjs"],
  ["admin roles + bug reports", "e2e/admin-bugreports.mjs"],
  ["program isolation", "e2e/program-isolation.mjs"],
  ["per-program group counts", "e2e/group-count.mjs"],
  ["session invalidation", "e2e/session-invalidation.mjs"],
  ["quiz question guards", "e2e/quiz-question-guards.mjs"],
  ["inco", "e2e/inco.mjs"],
  ["privacy + responsive", "e2e/privacy-and-responsive.mjs"],
  ["hootarena lifecycle", "e2e/hootarena.mjs"],
  ["hootarena reconnect", "e2e/hootarena-reconnect.mjs"],
  ["security regression", "e2e/security-regression.mjs"],
  ["launch readiness", "e2e/launch-readiness.mjs"],
  ["student profiles", "e2e/student-profile.mjs"],
  ["dashboard schedule + news", "e2e/dashboard-schedule-news.mjs"],
  ["student my profile", "e2e/student-my-profile.mjs"],
  ["admin bug reports page", "e2e/admin-bug-reports-page.mjs"],
  ["staff roles + access", "e2e/staff-roles.mjs"],
  ["dropdowns (every page, every role)", "e2e/dropdowns.mjs"],
  ["admin hootarena list", "e2e/admin-hootarena-list.mjs"],
  ["question forms", "e2e/question-forms.mjs"],
];

function run(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", file], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let out = "";
    child.stdout.on("data", (d) => { const s = d.toString(); out += s; process.stdout.write(s); });
    child.stderr.on("data", (d) => { const s = d.toString(); out += s; process.stderr.write(s); });
    child.on("close", (code) => resolve({ code, out }));
  });
}

const summary = [];
for (const [label, file] of SUITES) {
  console.log(`\n${"=".repeat(70)}\n  ${label}  (${file})\n${"=".repeat(70)}`);
  const started = Date.now();
  const { code, out } = await run(file);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  // Each suite prints its own "N/M checks passed" tally.
  const tally = [...out.matchAll(/(\d+)\/(\d+) checks passed/g)].pop();
  const passed = tally ? Number(tally[1]) : null;
  const total = tally ? Number(tally[2]) : null;
  summary.push({ label, code, passed, total, seconds });
}

// Several suites leave their throwaway student accounts behind (each run uses
// fresh RUN_ID-suffixed usernames, so nothing collides, but rows pile up). Sweep
// them once at the end so the database stays tidy across repeated runs. Only
// e2e-prefixed test accounts are touched; the two pre-seeded e2e admins that
// program-isolation/group-count log in with are kept.
try {
  const prisma = new PrismaClient();
  const { count } = await prisma.user.deleteMany({
    where: {
      username: { startsWith: "e2e-", notIn: ["e2e-test-admin", "e2e-net-admin"] },
      role: { in: ["STUDENT", "ADMIN"] },
      hootGamesHosted: { none: {} },
    },
  });
  await prisma.$disconnect();
  console.log(`\nSwept ${count} leftover e2e test account(s).`);
} catch (err) {
  console.log("\n(e2e account sweep skipped:", String(err).slice(0, 200), ")");
}

console.log(`\n${"=".repeat(70)}\n  SUMMARY\n${"=".repeat(70)}`);
let totalChecks = 0;
let totalPassed = 0;
let failedSuites = 0;
for (const s of summary) {
  if (s.total !== null) { totalChecks += s.total; totalPassed += s.passed; }
  const verdict = s.code === 0 ? "PASS" : "FAIL";
  if (s.code !== 0) failedSuites++;
  const checks = s.total !== null ? `${s.passed}/${s.total}` : "no tally";
  console.log(`  ${verdict.padEnd(5)} ${s.label.padEnd(30)} ${checks.padEnd(10)} ${s.seconds}s`);
}
console.log(`\n  ${totalPassed}/${totalChecks} checks passed across ${summary.length} suites; ${failedSuites} suite(s) failed.`);
if (failedSuites > 0) process.exitCode = 1;
