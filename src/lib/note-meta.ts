import type { StudentNoteKind } from "@/generated/prisma/enums";

/** Display label + color tone for every student-note category. */
export const NOTE_META: Record<StudentNoteKind, { title: string; tone: string }> = {
  MOTIVATION: { title: "Motivation updated", tone: "green" },
  COMMENT: { title: "Comment", tone: "violet" },
  PROGRESS: { title: "Progress", tone: "blue" },
  ISSUE: { title: "Issue reported", tone: "amber" },
  ACADEMIC: { title: "Academic", tone: "blue" },
  COMMUNICATION: { title: "Communication", tone: "violet" },
  FOLLOW_UP: { title: "Follow-up", tone: "amber" },
  FEEDBACK: { title: "Student feedback", tone: "green" },
};

/** Categories staff can pick when writing a note (MOTIVATION is written automatically). */
export const WRITABLE_NOTE_KINDS = [
  "COMMENT",
  "ACADEMIC",
  "PROGRESS",
  "COMMUNICATION",
  "FOLLOW_UP",
  "FEEDBACK",
  "ISSUE",
] as const satisfies readonly StudentNoteKind[];
