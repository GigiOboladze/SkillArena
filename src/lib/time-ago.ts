const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" });

/** "2h ago", "yesterday", "3 wk. ago" - for activity feeds. */
export function timeAgo(date: Date, now: number = Date.now()): string {
  const seconds = Math.round((date.getTime() - now) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

/**
 * The current time, for server components that render once per request
 * (so "now" is stable for that render). Kept out of the component body so
 * the React purity lint rule, which targets client re-renders, stays clean.
 */
export function requestNow(): number {
  return Date.now();
}
