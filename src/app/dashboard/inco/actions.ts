"use server";

import { redirect } from "next/navigation";
import { getCurrentStudent } from "@/lib/session";
import { createIncoSubmission } from "@/lib/inco";
import { INCO_CATEGORIES, MAX_INCO_MESSAGE_LENGTH } from "@/lib/inco-constants";
import { checkRateLimit, getIncoRateLimitKey } from "@/lib/rate-limit";
import type { IncoCategory } from "@/generated/prisma/client";

const VALID_CATEGORIES = INCO_CATEGORIES.map((c) => c.value);

export type SubmitIncoState = { error?: string; code?: string };

// Being logged in as a student is what gates who may open this form at all
// (ordinary /dashboard auth) - the submission itself still stores nothing
// that ties it back to this student's account. See IncoSubmission's own
// comment in schema.prisma for why there is no studentId column to omit
// here, not just an unused one.
export async function submitIncoMessage(_prev: SubmitIncoState, formData: FormData): Promise<SubmitIncoState> {
  const student = await getCurrentStudent();
  if (!student) redirect("/login");

  const rlKey = await getIncoRateLimitKey();
  if (!checkRateLimit(`inco:submit:${rlKey}`, 5, 10 * 60 * 1000)) {
    return { error: "ძალიან ბევრი მცდელობა. გთხოვთ სცადოთ მოგვიანებით." };
  }

  const category = String(formData.get("category") || "");
  const message = String(formData.get("message") || "").trim();

  if (!VALID_CATEGORIES.includes(category as IncoCategory)) {
    return { error: "გთხოვთ აირჩიოთ კატეგორია." };
  }
  if (!message) {
    return { error: "შეტყობინება არ შეიძლება იყოს ცარიელი." };
  }
  if (message.length > MAX_INCO_MESSAGE_LENGTH) {
    return { error: `შეტყობინება ძალიან გრძელია (მაქსიმუმ ${MAX_INCO_MESSAGE_LENGTH} სიმბოლო).` };
  }

  const code = await createIncoSubmission(category as IncoCategory, message);
  return { code };
}
