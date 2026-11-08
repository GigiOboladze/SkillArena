"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { generateClientToken } from "@/lib/tokens";
import { setStudentCookie } from "@/lib/student-session";
import { checkRateLimit, getPublicFormRateLimitKey } from "@/lib/rate-limit";

export async function joinHomework(homeworkId: string, formData: FormData) {
  const firstName = String(formData.get("firstName") || "").trim();
  const lastName = String(formData.get("lastName") || "").trim();

  const homework = await prisma.homework.findUnique({
    where: { id: homeworkId },
  });

  // SkillArena quizzes are taken from the student dashboard, never joined
  // anonymously through this legacy flow.
  if (!homework || homework.mode === "QUIZ") {
    redirect("/join?error=empty");
  }

  if (!firstName || !lastName) {
    redirect(`/join/${homework.joinCode}?error=name`);
  }

  if (homework.status !== "OPEN") {
    redirect(`/join/${homework.joinCode}?error=closed`);
  }

  const rateLimitKey = await getPublicFormRateLimitKey();
  if (!checkRateLimit(`homework:join:${rateLimitKey}`, 20, 10 * 60 * 1000)) {
    redirect(`/join/${homework.joinCode}?error=rate`);
  }

  const clientToken = generateClientToken();
  const student = await prisma.student.create({
    data: {
      homeworkId,
      firstName: firstName.slice(0, 60),
      lastName: lastName.slice(0, 60),
      clientToken,
    },
  });

  await setStudentCookie(homeworkId, student.id, clientToken);
  redirect(`/play/${homeworkId}`);
}
