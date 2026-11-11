/** Decorative illustration for the Add/Edit Question pages: a tilted card with a "?" and answer rows, one ticked. */
export function QuestionArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 300" className={className} aria-hidden>
      <defs>
        <linearGradient id="qa-card" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b3fd6" />
          <stop offset="1" stopColor="#2c1d78" />
        </linearGradient>
        <linearGradient id="qa-edge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c4b5fd" stopOpacity=".8" />
          <stop offset="1" stopColor="#8b6bff" stopOpacity=".15" />
        </linearGradient>
        <linearGradient id="qa-pick" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8b6bff" />
          <stop offset="1" stopColor="#6d4aff" />
        </linearGradient>
        <radialGradient id="qa-glow" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#8b6bff" stopOpacity=".55" />
          <stop offset="1" stopColor="#8b6bff" stopOpacity="0" />
        </radialGradient>
        <filter id="qa-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="14" stdDeviation="12" floodColor="#1b0f52" floodOpacity=".65" />
        </filter>
      </defs>
      <ellipse cx="150" cy="160" rx="140" ry="120" fill="url(#qa-glow)" />
      <path d="M232 34l-6 22M254 48l-16 14M266 74l-20 6" stroke="#a78bfa" strokeWidth="6" strokeLinecap="round" />
      <g filter="url(#qa-shadow)" transform="rotate(8 150 160)">
        <rect x="58" y="52" width="184" height="216" rx="26" fill="url(#qa-card)" stroke="url(#qa-edge)" strokeWidth="2.5" />
        <text x="150" y="122" textAnchor="middle" fontSize="62" fontWeight="900" fill="#c4b5fd" fontFamily="system-ui, sans-serif">?</text>
        <rect x="80" y="142" width="140" height="28" rx="14" fill="#ffffff" fillOpacity=".1" />
        <circle cx="96" cy="156" r="8" fill="#ffffff" fillOpacity=".25" />
        <rect x="112" y="152" width="70" height="7" rx="3.5" fill="#ffffff" fillOpacity=".25" />
        <rect x="80" y="180" width="140" height="30" rx="15" fill="url(#qa-pick)" />
        <circle cx="96" cy="195" r="9" fill="#fff" />
        <path d="m91.5 195 3 3 5.5-6" stroke="#6d4aff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="112" y="191" width="70" height="7" rx="3.5" fill="#fff" fillOpacity=".55" />
        <rect x="80" y="220" width="140" height="28" rx="14" fill="#ffffff" fillOpacity=".1" />
        <circle cx="96" cy="234" r="8" fill="none" stroke="#ffffff" strokeOpacity=".45" strokeWidth="2.4" />
        <rect x="112" y="230" width="70" height="7" rx="3.5" fill="#ffffff" fillOpacity=".25" />
      </g>
    </svg>
  );
}
