// INCO constants shared by client and server code - kept free of
// "server-only"/prisma imports (like quiz-constants.ts) so client components
// (the submit form, the status-check form) can use them directly.
import type { IncoCategory, IncoStatus } from "@/generated/prisma/client";

export const MAX_INCO_MESSAGE_LENGTH = 3000;

export const INCO_CATEGORIES: { value: IncoCategory; label: string }[] = [
  { value: "PERSONAL", label: "პირადი პრობლემა" },
  { value: "ACADEMIC", label: "აკადემიური საკითხი" },
  { value: "COMPLAINT", label: "საჩივარი" },
  { value: "SUGGESTION", label: "წინადადება" },
  { value: "PROGRAM", label: "სასწავლო პროგრამა" },
  { value: "LECTURER", label: "ლექტორი" },
  { value: "ADMINISTRATION", label: "ადმინისტრაცია" },
  { value: "STUDENT", label: "სხვა სტუდენტი" },
  { value: "OTHER", label: "სხვა" },
];

export const INCO_CATEGORY_LABELS: Record<IncoCategory, string> = Object.fromEntries(
  INCO_CATEGORIES.map((c) => [c.value, c.label])
) as Record<IncoCategory, string>;

export const INCO_STATUS_LABELS: Record<IncoStatus, string> = {
  NEW: "ახალი",
  IN_PROGRESS: "განხილვაში",
  RESOLVED: "დასრულებული",
};
