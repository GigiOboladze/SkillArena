"use client";

import { useEffect, useState } from "react";

/**
 * Animates from 0 up to `value` once on mount - a restrained "score reveal"
 * moment for the completion screen, not a persistent/looping animation.
 * Respects prefers-reduced-motion by jumping straight to the final value.
 */
export function CountUp({ value, durationMs = 700 }: { value: number; durationMs?: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    // Reduced motion, or nothing to count up to: settle straight on the final
    // value. Done inside a requestAnimationFrame rather than synchronously in
    // the effect body - a synchronous setState here forces an immediate second
    // render pass for no benefit (what react-hooks/set-state-in-effect flags).
    // One frame is imperceptible and the resulting value is identical.
    const prefersReducedMotion =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion || value <= 0) {
      const settle = requestAnimationFrame(() => setDisplay(Math.max(0, value)));
      return () => cancelAnimationFrame(settle);
    }

    const start = performance.now();
    let frame: number;
    function tick(now: number) {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return <>{display}</>;
}
