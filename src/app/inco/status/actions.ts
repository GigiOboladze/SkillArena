"use server";

import { findIncoSubmissionByCode } from "@/lib/inco";
import { INCO_CATEGORY_LABELS, INCO_STATUS_LABELS } from "@/lib/inco-constants";
import { checkRateLimit, getIncoRateLimitKey } from "@/lib/rate-limit";

export type CheckIncoState = {
  error?: string;
  result?: {
    category: string;
    status: string;
    submittedAt: string;
    response: string | null;
  };
};

// Deliberately no login/session check anywhere in this file - the whole
// point of the reference code is that it stands in for identity, so
// checking it must not require proving who you are. Rate-limited (not by
// IP - see rate-limit.ts) to blunt brute-force guessing of other students'
// codes; the lookup itself is by a hash of the exact code (findIncoSubmissionByCode),
// so a near-miss guess can never partially match another submission.
export async function checkIncoStatus(_prev: CheckIncoState, formData: FormData): Promise<CheckIncoState> {
  const rlKey = await getIncoRateLimitKey();
  if (!checkRateLimit(`inco:check:${rlKey}`, 10, 10 * 60 * 1000)) {
    return { error: "ძალიან ბევრი მცდელობა. გთხოვთ სცადოთ მოგვიანებით." };
  }

  const code = String(formData.get("code") || "").trim();
  if (!code) return { error: "შეიყვანეთ კოდი." };

  const submission = await findIncoSubmissionByCode(code);
  if (!submission) {
    return { error: "კოდი ვერ მოიძებნა. გადაამოწმეთ და სცადეთ ისევ." };
  }

  return {
    result: {
      category: INCO_CATEGORY_LABELS[submission.category],
      status: INCO_STATUS_LABELS[submission.status],
      submittedAt: submission.createdAt.toISOString(),
      response: submission.response,
    },
  };
}
