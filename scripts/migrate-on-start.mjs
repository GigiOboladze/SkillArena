// Runs automatically before `npm start` (npm "prestart" hook), so every
// production deploy (Railway) brings the database schema up to date before
// the server starts serving the new code.
//
// 1. `prisma migrate deploy` - the normal path: applies any migrations the
//    database hasn't recorded yet. A no-op when everything is applied.
// 2. If that fails (e.g. a database created without migration history), the
//    migrations marked "@local-idempotent" are applied directly instead.
//    They use IF NOT EXISTS everywhere, so running them again is harmless.
// 3. Never blocks startup: if the database can't be migrated at all, the
//    error is logged loudly and the server still starts, so the existing
//    site keeps working instead of the whole deploy going down.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const isWin = process.platform === "win32";

function run(args) {
  console.log(`[migrate] npx ${args.join(" ")}`);
  const r = spawnSync(isWin ? "npx.cmd" : "npx", args, { cwd: root, stdio: "inherit", env: process.env, shell: isWin });
  return r.status === 0;
}

if (!process.env.DATABASE_URL) {
  console.warn("[migrate] DATABASE_URL is not set - skipping migrations.");
  process.exit(0);
}

if (run(["prisma", "migrate", "deploy"])) {
  console.log("[migrate] database is up to date.");
  process.exit(0);
}

console.warn("[migrate] `prisma migrate deploy` failed - applying idempotent migrations directly.");
const dir = path.join(root, "prisma", "migrations");
let failed = false;
for (const name of readdirSync(dir).sort()) {
  const file = path.join(dir, name, "migration.sql");
  if (!existsSync(file)) continue;
  if (!readFileSync(file, "utf8").includes("@local-idempotent")) continue;
  if (!run(["prisma", "db", "execute", "--file", file, "--schema", path.join("prisma", "schema.prisma")])) failed = true;
}
if (failed) {
  console.error("[migrate] !!! Some migrations could not be applied - new features may error until this is fixed. Starting anyway.");
} else {
  console.log("[migrate] idempotent migrations applied.");
}
process.exit(0);
