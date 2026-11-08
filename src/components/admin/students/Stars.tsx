/** Read-only 5-star rating (fractional fill), drawn by CSS - see .sa-stars. */
export function Stars({ value, className = "" }: { value: number | null | undefined; className?: string }) {
  const pct = value ? Math.max(0, Math.min(100, (value / 5) * 100)) : 0;
  return (
    <span
      className={`sa-stars ${className}`}
      style={{ "--pct": `${pct}%` } as React.CSSProperties}
      role="img"
      aria-label={value ? `${value.toFixed(1)} out of 5` : "Not rated"}
    />
  );
}

/** Circular progress ring for a 0-100 percentage. */
export function AccuracyRing({ value, size = 30 }: { value: number | null; size?: number }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const pct = value ?? 0;
  return (
    <svg viewBox="0 0 36 36" width={size} height={size} className="sa-ring" aria-hidden>
      <circle cx="18" cy="18" r={r} className="sa-ring-track" />
      <circle
        cx="18"
        cy="18"
        r={r}
        className="sa-ring-value"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        transform="rotate(-90 18 18)"
      />
    </svg>
  );
}
