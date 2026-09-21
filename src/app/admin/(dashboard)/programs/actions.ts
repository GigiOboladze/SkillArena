"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentSuperAdmin } from "@/lib/session";

async function requireSuperAdmin() {
  const superAdmin = await getCurrentSuperAdmin();
  if (!superAdmin) redirect("/admin");
  return superAdmin;
}

const MIN_GROUP_COUNT = 1;
const MAX_GROUP_COUNT = 10;
const DEFAULT_GROUP_COUNT = 3;

// Roman numerals for up to MAX_GROUP_COUNT groups - a lookup table rather
// than a general converter, since group counts are always small in
// practice. Group names are "Group <numeral>", matching the existing
// I/II/III convention exactly.
const ROMAN_NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export async function createProgram(formData: FormData) {
  await requireSuperAdmin();

  const name = String(formData.get("name") || "").trim();
  if (!name) redirect("/admin/programs?error=name");

  const existing = await prisma.program.findUnique({ where: { name } });
  if (existing) redirect("/admin/programs?error=taken");

  const groupCountRaw = Number(formData.get("groupCount"));
  const groupCount =
    Number.isInteger(groupCountRaw) && groupCountRaw >= MIN_GROUP_COUNT && groupCountRaw <= MAX_GROUP_COUNT
      ? groupCountRaw
      : DEFAULT_GROUP_COUNT;

  const count = await prisma.program.count();
  await prisma.program.create({ data: { name, order: count, groupCount } });

  revalidatePath("/admin/programs");
  redirect("/admin/programs?created=1");
}

/**
 * Adding a subject always creates its fixed groups (I, II, ... up to the
 * PROGRAM's own groupCount - see Program's schema comment, this is
 * per-program, not a global constant) in the same transaction - a subject
 * with no groups would be unusable for targeting or assignment.
 */
export async function createSubject(programId: string, formData: FormData) {
  await requireSuperAdmin();

  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program) redirect("/admin/programs?error=program");

  const name = String(formData.get("name") || "").trim();
  if (!name) redirect(`/admin/programs/${programId}?error=name`);

  const existing = await prisma.subject.findUnique({ where: { programId_name: { programId, name } } });
  if (existing) redirect(`/admin/programs/${programId}?error=taken`);

  const count = await prisma.subject.count({ where: { programId } });
  const groupNames = ROMAN_NUMERALS.slice(0, program.groupCount).map((numeral) => `Group ${numeral}`);

  await prisma.subject.create({
    data: {
      programId,
      name,
      order: count,
      groups: { create: groupNames.map((groupName, i) => ({ name: groupName, order: i })) },
    },
  });

  revalidatePath(`/admin/programs/${programId}`);
  redirect(`/admin/programs/${programId}?created=1`);
}
