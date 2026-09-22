import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

// One-off recovery tool: resets the existing SUPER_ADMIN's username/password
// back to ADMIN_USERNAME/ADMIN_PASSWORD (used when self-service changes in
// /admin/profile left the account in an unknown state due to a UI bug that
// silently swallowed validation errors). Only touches the SUPER_ADMIN role -
// never creates a new row, never touches ADMIN/STUDENT accounts.
async function main() {
  const username = (process.env.ADMIN_USERNAME || process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    throw new Error("Set ADMIN_USERNAME (or ADMIN_EMAIL) and ADMIN_PASSWORD before running this.");
  }

  const admin = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" } });
  if (!admin) {
    throw new Error("No SUPER_ADMIN account exists - use the normal seed script instead.");
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: admin.id },
    data: { username, passwordHash, sessionVersion: { increment: 1 } },
  });

  console.log(`Reset Super Admin account (was "${admin.username}") to username "${username}". All existing sessions invalidated.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
