"use client";

import { useEffect, useState } from "react";

/**
 * Cosmetic client-side countdown only - the real 100s-per-question deadline
 * lives server-side (AttemptAnswer.deadlineAt) and is what actually decides
 * whether a selection or submission is accepted. This just ticks down from
 * the server-computed `initialRemainingSeconds` and calls `onExpire` once,
 * so the student sees a live clock and moves on automatically when it hits
 * zero - even if this never fires (tab was closed, JS disabled), the server
 * still enforces the deadline independently on the next request.
 */
export function QuizTimer({
  initialRemainingSeconds,
  onExpire,
}: {
  initialRemainingSeconds: number;
  onExpire: () => void;
}) {
  const [seconds, setSeconds] = useState(initialRemainingSeconds);

  useEffect(() => {
    setSeconds(initialRemainingSeconds);
  }, [initialRemainingSeconds]);

  useEffect(() => {
    if (seconds <= 0) {
      onExpire();
      return;
    }
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds]);

  // Three urgency tiers, per the "100-31 normal / 30-11 noticeable / 10-0
  // strong urgency" design: only the last tier animates, so the countdown
  // doesn't pulse for the whole last third of every question.
  const critical = seconds <= 10;
  const warning = seconds <= 30 && !critical;

  return (
    <div
      className={`flex flex-col items-center ${critical ? "text-rahoot-red" : warning ? "text-skillarena-accent" : ""}`}
    >
      <span className="text-xs uppercase tracking-wide text-rahoot-muted">Time remaining</span>
      <span
        className={`font-mono text-3xl font-black tabular-nums transition-transform ${
          critical ? "animate-pulse scale-110" : warning ? "scale-105" : ""
        }`}
      >
        {Math.max(0, seconds)}
      </span>
    </div>
  );
}
