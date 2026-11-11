/** Labels and colour tones for bug report status / priority (UI only). */
export const BUG_STATUS = {
  OPEN: { label: "Open", tone: "red" },
  IN_PROGRESS: { label: "In Progress", tone: "amber" },
  RESOLVED: { label: "Resolved", tone: "green" },
} as const;

export const BUG_PRIORITY = {
  LOW: { label: "Low", tone: "slate" },
  MEDIUM: { label: "Medium", tone: "blue" },
  HIGH: { label: "High", tone: "amber" },
  CRITICAL: { label: "Critical", tone: "red" },
} as const;

export type BugStatusKey = keyof typeof BUG_STATUS;
export type BugPriorityKey = keyof typeof BUG_PRIORITY;
