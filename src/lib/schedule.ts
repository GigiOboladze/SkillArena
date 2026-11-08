/**
 * Shared constants and helpers for the weekly class schedule (student
 * dashboard "Class Schedule" + the admin editor on a student's profile).
 * No server-only imports here so client components can use it too.
 */

export const SCHEDULE_TONES = ["violet", "teal", "amber", "pink", "blue", "green"] as const;
export type ScheduleTone = (typeof SCHEDULE_TONES)[number];

export const SCHEDULE_ICONS = [
  { key: "code", label: "Code" },
  { key: "book", label: "Book" },
  { key: "git", label: "Git" },
  { key: "chart", label: "Chart" },
  { key: "palette", label: "Design" },
  { key: "globe", label: "Globe" },
  { key: "terminal", label: "Terminal" },
] as const;
export type ScheduleIcon = (typeof SCHEDULE_ICONS)[number]["key"];

/** ISO weekday (1 = Monday ... 7 = Sunday) -> short label. */
export const DAY_LABELS: Record<number, string> = { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun" };
export const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** The school's wall clock - schedule times are local Tbilisi times. */
export const SCHOOL_TIME_ZONE = "Asia/Tbilisi";

export const MAX_SCHEDULE_ENTRIES = 12;

export function isTone(v: string): v is ScheduleTone {
  return (SCHEDULE_TONES as readonly string[]).includes(v);
}
export function isIcon(v: string): v is ScheduleIcon {
  return SCHEDULE_ICONS.some((i) => i.key === v);
}

export function formatDays(days: number[]) {
  return [...days].sort((a, b) => a - b).map((d) => DAY_LABELS[d]).filter(Boolean).join(", ");
}

/** "HH:MM" (00:00-23:59) or null. */
export function parseTime(v: unknown): string | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(v ?? "").trim());
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

/** ISO weekday of "today" in the school's time zone. */
export function schoolWeekday(now: Date = new Date()): number {
  const short = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: SCHOOL_TIME_ZONE }).format(now);
  const idx = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(short);
  return idx === -1 ? 1 : idx + 1;
}

export const SCHEDULE_VIEWS = [
  { key: "week", label: "This Week" },
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
] as const;
export type ScheduleView = (typeof SCHEDULE_VIEWS)[number]["key"];
