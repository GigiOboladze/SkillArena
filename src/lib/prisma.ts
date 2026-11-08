import { PrismaClient } from "@/generated/prisma/client";

// One PrismaClient for the whole process, reused across hot-reloads in dev so
// we don't exhaust the database's connection limit every time server.ts or a
// route file reloads.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }
  return globalForPrisma.prisma;
}

/**
 * The shared client, created on FIRST USE rather than when this module is
 * imported.
 *
 * Why: Prisma's library engine loads its native query-engine binary inside
 * the PrismaClient constructor (`query_engine-windows.dll.node`, ~21MB, on
 * Windows). In `next dev`, Next.js spawns a short-lived helper process (the
 * "static paths worker") for every dynamic route it serves - /admin/quizzes/[id],
 * /quiz/[id], ... - which only IMPORTS the page's modules to read its route
 * config and never runs a query. With an eagerly constructed client, each of
 * those helpers loaded the native engine too; on Windows that is what surfaced
 * as "Jest worker encountered 2 child process exceptions, exceeding retry
 * limit" when opening a quiz page. Deferring construction means a process that
 * never queries never loads the engine. Behaviour for real requests is
 * unchanged: the first query constructs the same single client as before.
 *
 * Every property access (model delegates, $transaction, $queryRaw, ...) is
 * forwarded to the real client; methods are bound to it so `this` is correct.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
