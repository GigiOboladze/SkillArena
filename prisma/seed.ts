import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

// The college's initial programs and curriculum. Not an enum/hardcoded
// switch anywhere in the app - these are just the starting rows; more
// programs/subjects/groups can be added later straight from the database
// (or the Super Admin UI) without any code change, since Program/Subject/
// Group are real tables the quiz/student system queries relationally.
// groupCount is per-program (see Program's schema comment) - Front-end
// Development needs 4 fixed groups (I-IV), Networks needs 3 (I-III). Not a
// global constant, so a future program can specify its own count too.
const PROGRAMS: { name: string; order: number; groupCount: number; subjects: string[] }[] = [
  {
    name: "Front-end Development",
    order: 0,
    groupCount: 4,
    subjects: [
      "English",
      "Marketing (HTML/CSS)",
      "JavaScript",
      "TypeScript",
      "Git",
      "Optimization",
      "Entrepreneurship",
      "Communications",
    ],
  },
  {
    name: "Networks",
    order: 1,
    groupCount: 3,
    subjects: [
      "კომპიუტერული ქსელები და სისტემები",
      "კომპიუტერის და პერიფერიული მოწყობილობების უზრუნველყოფა",
      "ინგლისური",
    ],
  },
];
const ROMAN_NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

async function seedAdmin() {
  const username = (process.env.ADMIN_USERNAME || process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    console.log(
      "Skipping admin seed: set ADMIN_USERNAME (or ADMIN_EMAIL) and ADMIN_PASSWORD to bootstrap the first admin."
    );
    return;
  }

  // Check by role, not just by username: exactly one SUPER_ADMIN can ever
  // exist (see the partial unique index), so if one already exists under a
  // different username than ADMIN_USERNAME (e.g. renamed via /admin/profile),
  // we must still skip - attempting create() here would hit that constraint
  // and fail the whole seed/deploy, not just silently no-op.
  const existing = await prisma.user.findFirst({ where: { OR: [{ username }, { role: "SUPER_ADMIN" }] } });
  if (existing) {
    console.log(`Super Admin already exists as "${existing.username}" - nothing to do.`);
    return;
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.create({
    data: {
      firstName: "Admin",
      lastName: "",
      username,
      passwordHash,
      role: "SUPER_ADMIN",
      // programId stays null - Super Admin is never scoped to one program.
    },
  });

  console.log(`Created Super Admin account "${username}". Log in at /admin/login and change the password if needed.`);
}

async function seedProgramsAndSubjects() {
  for (const program of PROGRAMS) {
    const programRow = await prisma.program.upsert({
      where: { name: program.name },
      create: { name: program.name, order: program.order, groupCount: program.groupCount },
      update: {},
    });

    const groupNames = ROMAN_NUMERALS.slice(0, program.groupCount).map((numeral) => `Group ${numeral}`);

    for (const [subjectIndex, name] of program.subjects.entries()) {
      const subject = await prisma.subject.upsert({
        where: { programId_name: { programId: programRow.id, name } },
        create: { programId: programRow.id, name, order: subjectIndex },
        update: {},
      });

      for (const [groupIndex, groupName] of groupNames.entries()) {
        await prisma.group.upsert({
          where: { subjectId_name: { subjectId: subject.id, name: groupName } },
          create: { subjectId: subject.id, name: groupName, order: groupIndex },
          update: {},
        });
      }
    }
  }
  console.log(`Ensured ${PROGRAMS.length} programs with their subjects and each program's own fixed groups exist.`);
}

async function main() {
  await seedAdmin();
  await seedProgramsAndSubjects();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
