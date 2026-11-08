import type React from "react";
import type { ScheduleIcon as IconKey } from "@/lib/schedule";

const PATHS: Record<IconKey, React.ReactNode> = {
  code: <path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5" />,
  book: (
    <>
      <path d="M12 6.5C10.3 5.2 7.9 4.6 4 4.8v13c3.9-.2 6.3.4 8 1.7 1.7-1.3 4.1-1.9 8-1.7v-13c-3.9-.2-6.3.4-8 1.7Z" />
      <path d="M12 6.5v13" />
    </>
  ),
  // Branch-like arc with two endpoints, like the design's Git tile.
  git: (
    <>
      <path d="M6 18.5V12a6 6 0 0 1 12 0v6.5" />
      <rect x="3.5" y="15" width="5" height="5.5" rx="1.6" />
      <rect x="15.5" y="15" width="5" height="5.5" rx="1.6" />
    </>
  ),
  chart: <path d="M4.5 19.5h15M7.5 16v-5M12 16V7.5M16.5 16v-8" />,
  palette: (
    <>
      <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.3 0 1.8-.8 1.8-1.6 0-1.3-1.1-1.5-1.1-2.6 0-.9.7-1.6 1.6-1.6h2.1a4.1 4.1 0 0 0 4.1-4.1C20.5 6.6 16.7 3.5 12 3.5Z" />
      <circle cx="7.8" cy="11" r="1" />
      <circle cx="10.5" cy="7.5" r="1" />
      <circle cx="15" cy="8" r="1" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5S9.7 5.9 12 3.5Z" />
    </>
  ),
  terminal: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="m7.5 10 2.5 2-2.5 2M12.5 15h4" />
    </>
  ),
};

export function ScheduleIcon({ icon, className = "h-6 w-6" }: { icon: string; className?: string }) {
  const body = PATHS[icon as IconKey] ?? PATHS.book;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {body}
    </svg>
  );
}
