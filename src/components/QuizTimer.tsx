"use client";

import { useEffect, useState } from "react";

export function QuizTimer({
  initialRemainingSeconds,
  onExpire,
}: {
  initialRemainingSeconds: number;
  onExpire: () => void;
}) {
  const [seconds, setSeconds] = useState(initialRemainingSeconds);
  const [syncedTo, setSyncedTo] = useState(initialRemainingSeconds);

  if (syncedTo !== initialRemainingSeconds) {
    setSyncedTo(initialRemainingSeconds);
    setSeconds(initialRemainingSeconds);
  }

  useEffect(() => {
    if (seconds <= 0) {
      onExpire();
      return;
    }
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds]);

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
