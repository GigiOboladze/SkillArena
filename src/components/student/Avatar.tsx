/**
 * Student avatar circle.
 *
 * For now it shows the student's initials on a colour picked
 * deterministically from their id (so the same student always gets the
 * same colour on every page). When the pet system lands, pass `src` with
 * the pet image and the initials fallback is skipped - every place that
 * shows a student already goes through this one component.
 */
const HUES = [265, 200, 330, 150, 25, 285, 175, 0];

function hueFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}

import type { CSSProperties } from "react";

export function Avatar({
  seed,
  firstName,
  lastName,
  size = 44,
  src,
  className = "",
}: {
  seed: string;
  firstName: string;
  lastName: string;
  size?: number;
  src?: string | null;
  className?: string;
}) {
  const hue = hueFor(seed);
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  return (
    <span
      className={`sa-avatar ${className}`}
      // Only the two numbers that vary go inline; the size maths and the
      // gradient live in .sa-avatar (globals.css). Leaderboards render hundreds
      // of these, so a short style attribute adds up.
      style={{ "--av-h": hue, "--av-size": `${size}px` } as CSSProperties}
      aria-hidden
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- pet images will be small static assets
        <img src={src} alt="" className="h-full w-full rounded-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}
