import "server-only";
import { prisma } from "@/lib/prisma";
import type { User } from "@/generated/prisma/client";

export async function listPrograms() {
  return prisma.program.findMany({ orderBy: { order: "asc" } });
}

export async function getProgram(programId: string) {
  return prisma.program.findUnique({ where: { id: programId } });
}

/**
 * The program id an admin's management views should be scoped to. A regular
 * Admin is always scoped to their own assigned program (any `requested` id
 * from a query param is ignored - never trust a client-supplied program id
 * over the account's own row). The Super Admin may pick any real program via
 * `requested`, falling back to the first program (by `order`) if omitted or
 * invalid. Returns null only if there are no programs at all.
 */
export async function resolveAdminProgramScope(
  admin: Pick<User, "role" | "programId">,
  requested: string | undefined
): Promise<string | null> {
  if (admin.role !== "SUPER_ADMIN") {
    return admin.programId;
  }

  if (requested) {
    const exists = await prisma.program.findUnique({ where: { id: requested }, select: { id: true } });
    if (exists) return exists.id;
  }

  const first = await prisma.program.findFirst({ orderBy: { order: "asc" }, select: { id: true } });
  return first?.id ?? null;
}
