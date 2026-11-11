/** Bug-report page artwork and icons (decorative SVG, theme-aware via currentColor / CSS vars). */

export function IconBugSolid({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M11 9.5a5 5 0 0 1 10 0v1H11v-1Z" fill="currentColor" opacity=".85" />
      <path d="M12.3 5.2 10.5 3M19.7 5.2 21.5 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 12.5h14v6.5a7 7 0 0 1-14 0v-6.5Z" fill="currentColor" />
      <path d="M16 13v12.5" stroke="var(--bug-line, rgba(0,0,0,.35))" strokeWidth="1.6" />
      <path d="M9 15H4.5M9 20H4M10 24.5l-3.5 3M23 15h4.5M23 20h5M22 24.5l3.5 3M10.5 11 7 8.5M21.5 11 25 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IconClockSolid({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.2 2" />
    </svg>
  );
}

export function IconCheckCircle({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path d="m7.5 12.3 3 3 6-6.3" fill="none" stroke="#0b1a10" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Hero illustration: a laptop with a bug on screen, a code tile and a warning tile. */
export function BugHeroArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 220" className={className} aria-hidden>
      <defs>
        <linearGradient id="bh-screen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b2a8f" />
          <stop offset="1" stopColor="#1b1446" />
        </linearGradient>
        <linearGradient id="bh-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b6bff" />
          <stop offset="1" stopColor="#5b3fd6" />
        </linearGradient>
        <linearGradient id="bh-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3a2a7a" />
          <stop offset="1" stopColor="#221a52" />
        </linearGradient>
        <radialGradient id="bh-glow" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#8b6bff" stopOpacity=".55" />
          <stop offset="1" stopColor="#8b6bff" stopOpacity="0" />
        </radialGradient>
        <filter id="bh-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#2a1670" floodOpacity=".55" />
        </filter>
      </defs>
      <ellipse cx="250" cy="180" rx="170" ry="40" fill="url(#bh-glow)" />
      <path d="M0 210 C 110 210, 170 130, 300 120 S 420 60, 420 40" fill="none" stroke="#8b6bff" strokeOpacity=".35" strokeWidth="2" />

      {/* laptop */}
      <g filter="url(#bh-soft)" transform="rotate(-8 250 110)">
        <rect x="170" y="22" width="170" height="112" rx="10" fill="url(#bh-body)" />
        <rect x="178" y="30" width="154" height="96" rx="6" fill="url(#bh-screen)" />
        <path d="M150 140 h210 l-16 22 h-178 Z" fill="url(#bh-body)" />
        <path d="M150 140 h210 v4 l-16 22 h-178 l-16 -22 Z" fill="#4a32b8" opacity=".55" />
        <g stroke="#2a1d78" strokeWidth="1" opacity=".55">
          {Array.from({ length: 6 }, (_, i) => (
            <path key={i} d={`M${176 + i * 30} 145 l-4 15`} />
          ))}
        </g>
        {/* bug on screen */}
        <g transform="translate(232 50)" color="#b79bff">
          <path d="M11 9.5a7 7 0 0 1 14 0v1.5H11Z" fill="currentColor" opacity=".85" />
          <path d="M13 4 10.5 1M23 4l2.5-3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M8 13h20v10a10 10 0 0 1-20 0Z" fill="currentColor" />
          <path d="M18 13.5v19" stroke="#2a1d78" strokeWidth="2" />
          <path d="M8 17H2M8 24H1.5M10 30l-5 4M28 17h6M28 24h6.5M26 30l5 4M9.5 11 4.5 7.5M26.5 11l5-3.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        </g>
      </g>

      {/* code tile */}
      <g filter="url(#bh-soft)" transform="rotate(-10 85 40)">
        <rect x="58" y="14" width="58" height="54" rx="12" fill="url(#bh-tile)" stroke="#8b6bff" strokeOpacity=".45" />
        <path d="m76 33-7 8 7 8M98 33l7 8-7 8M90 30l-6 22" stroke="#b79bff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>

      {/* warning tile */}
      <g filter="url(#bh-soft)" transform="rotate(10 380 120)">
        <rect x="352" y="94" width="56" height="56" rx="12" fill="url(#bh-tile)" stroke="#8b6bff" strokeOpacity=".45" />
        <path d="M380 108 395 136h-30Z" fill="none" stroke="#c4b5fd" strokeWidth="3" strokeLinejoin="round" />
        <path d="M380 118v8M380 131v.5" stroke="#c4b5fd" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** Empty-state illustration: a browser window with a bug. */
export function BugEmptyArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 150" className={className} aria-hidden>
      <defs>
        <linearGradient id="be-win" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a2a7a" />
          <stop offset="1" stopColor="#241a56" />
        </linearGradient>
      </defs>
      <rect x="30" y="34" width="134" height="106" rx="12" fill="url(#be-win)" stroke="#8b6bff" strokeOpacity=".55" strokeWidth="1.5" />
      <path d="M30 56h134" stroke="#8b6bff" strokeOpacity=".45" />
      <circle cx="44" cy="45" r="3.2" fill="#c4b5fd" />
      <circle cx="54" cy="45" r="3.2" fill="#c4b5fd" />
      <circle cx="64" cy="45" r="3.2" fill="#c4b5fd" />
      <rect x="74" y="42.5" width="76" height="5" rx="2.5" fill="#8b6bff" opacity=".7" />
      <g transform="translate(78 66)" color="#a78bfa">
        <path d="M11 9.5a7 7 0 0 1 14 0v1.5H11Z" fill="currentColor" opacity=".85" />
        <path d="M13 4 10.5 1M23 4l2.5-3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M8 13h20v10a10 10 0 0 1-20 0Z" fill="currentColor" />
        <path d="M18 13.5v19" stroke="#241a56" strokeWidth="2" />
        <path d="M8 17H2M8 24H1.5M10 30l-5 4M28 17h6M28 24h6.5M26 30l5 4M9.5 11 4.5 7.5M26.5 11l5-3.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      </g>
      <path d="M168 14l-6 12M182 24l-11 7M186 40h-13" stroke="#a78bfa" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}
