/**
 * Small inline SVG icon set for the student area.
 *
 * Inline SVG (rather than an icon font or a new npm dependency) keeps the
 * bundle unchanged and lets every icon inherit `currentColor`, so the same
 * icon works in dark and light themes without separate assets.
 */
type IconProps = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function IconHome({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3.5 10.5 12 4l8.5 6.5" />
      <path d="M5.5 9v10.5h13V9" />
      <path d="M10 19.5v-5h4v5" />
    </svg>
  );
}

export function IconTrophy({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M7.5 4.5h9v4a4.5 4.5 0 0 1-9 0v-4Z" />
      <path d="M7.5 6.5H4.5a3 3 0 0 0 3 3.5M16.5 6.5h3a3 3 0 0 1-3 3.5" />
      <path d="M12 13v3.5M8.5 20h7M9.5 20l.5-3.5h4l.5 3.5" />
    </svg>
  );
}

export function IconBug({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="7" y="7.5" width="10" height="12" rx="5" />
      <path d="M9.5 7.5a2.5 2.5 0 0 1 5 0M12 11v8.5M3.5 13H7M17 13h3.5M4.5 8.5 7.5 10M19.5 8.5 16.5 10M4.5 18.5l3-1.5M19.5 18.5l-3-1.5" />
    </svg>
  );
}

export function IconMessage({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4.5 3.5v-3.5h-1v-10Z" />
      <path d="M8.5 9.5h7M8.5 12.5h4.5" />
    </svg>
  );
}

export function IconUser({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="8.5" r="3.75" />
      <path d="M4.75 20a7.25 7.25 0 0 1 14.5 0" />
    </svg>
  );
}

export function IconLogout({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M14 4.5H6.5a1.5 1.5 0 0 0-1.5 1.5v12a1.5 1.5 0 0 0 1.5 1.5H14" />
      <path d="M10.5 12h9M16.5 8.5 20 12l-3.5 3.5" />
    </svg>
  );
}

export function IconArrowRight({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5" />
    </svg>
  );
}

export function IconBolt({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path d="M13.5 2.5 5 13.5h6l-1 8 8.5-11h-6l1-8Z" fill="currentColor" />
    </svg>
  );
}

export function IconClock({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IconCheck({ className }: IconProps) {
  return (
    <svg {...base} className={className} strokeWidth={2.6}>
      <path d="m6 12.5 4 4 8-9" />
    </svg>
  );
}

export function IconX({ className }: IconProps) {
  return (
    <svg {...base} className={className} strokeWidth={2.6}>
      <path d="M7 7l10 10M17 7 7 17" />
    </svg>
  );
}

export function IconStar({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        d="m12 2.8 2.75 5.6 6.15.9-4.45 4.33 1.05 6.12L12 16.87l-5.5 2.88 1.05-6.12L3.1 9.3l6.15-.9L12 2.8Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconPlay({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path d="M8 5.5v13l10.5-6.5L8 5.5Z" fill="currentColor" />
    </svg>
  );
}

export function IconQuiz({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="5" y="3.5" width="14" height="17" rx="2.5" />
      <path d="M9 8.5h6M9 12h6M9 15.5h3.5" />
    </svg>
  );
}

export function IconGamepad({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M7 7.5h10a4.5 4.5 0 0 1 4.4 5.5l-.8 3.6a2.4 2.4 0 0 1-4.1 1.1L14.8 16H9.2l-1.7 1.7a2.4 2.4 0 0 1-4.1-1.1L2.6 13A4.5 4.5 0 0 1 7 7.5Z" />
      <path d="M8 10.5v3M6.5 12h3M15.5 11h.01M17.5 13h.01" />
    </svg>
  );
}

export function IconUsers({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="9" cy="8.5" r="3.25" />
      <path d="M2.75 19.5a6.25 6.25 0 0 1 12.5 0" />
      <path d="M15.5 5.6a3.25 3.25 0 0 1 0 5.8M17.5 13.6a6.2 6.2 0 0 1 3.75 5.9" />
    </svg>
  );
}

export function IconShield({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3.5 5 6v5.5c0 4.3 2.9 7.6 7 9 4.1-1.4 7-4.7 7-9V6l-7-2.5Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </svg>
  );
}

export function IconLayers({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="m12 4 8.5 4.5L12 13 3.5 8.5 12 4Z" />
      <path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5" />
    </svg>
  );
}

export function IconPlus({ className }: IconProps) {
  return (
    <svg {...base} className={className} strokeWidth={2.4}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
