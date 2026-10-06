"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentStudent } from "@/lib/session";
import { isStudentEligibleForHootGame } from "@/lib/hootarena/access";
import { checkRateLimit } from "@/lib/rate-limit";

const PIN_PATTERN = /^\d{6}$/;

/**
 * Validates the PIN and the student's eligibility, then hands off to the
 * play page - the actual HootPlayer row is created (or reconnected onto) by
 * the `player:join` socket handler in server.ts, which re-runs this exact
 * same eligibility check server-side before doing so. This action is a fast,
 * friendly-error front door, not the security boundary itself (see spec:
 * authorization is enforced regardless of how a student arrives at the game).
 */
export async function joinHootGameByPin(formData: FormData) {
  const student = await getCurrentStudent();
  if (!student) redirect("/login");

  // Keyed by the authenticated user, not IP - a shared classroom network
  // would otherwise rate-limit every student behind the same address
  // together. 15 attempts/minute comfortably covers typos without opening a
  // meaningful PIN brute-force window (900,000 possible PINs).
  if (!checkRateLimit(`hootarena-join:${student.id}`, 15, 60_000)) {
    redirect("/dashboard/hootarena?error=ratelimit");
  }

  const pin = String(formData.get("pin") || "").trim();
  if (!PIN_PATTERN.test(pin)) {
    redirect("/dashboard/hootarena?error=format");
  }

  const game = await prisma.hootGame.findUnique({ where: { pin }, select: { id: true, subjectId: true, status: true } });
  if (!game) {
    redirect("/dashboard/hootarena?error=notfound");
  }
  if (game.status === "FINISHED") {
    redirect("/dashboard/hootarena?error=ended");
  }

  const eligible = await isStudentEligibleForHootGame(student.id, game);
  if (!eligible) {
    redirect("/dashboard/hootarena?error=ineligible");
  }

  redirect(`/dashboard/hootarena/play/${game.id}`);
}
