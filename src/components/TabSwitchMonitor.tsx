"use client";

import { useEffect, useRef, useState } from "react";
import { reportTabSwitch } from "@/app/quiz/[id]/actions";

/**
 * Anti-cheat: watches document.visibilitychange (tab switch, minimize, app
 * switch on most platforms) and window blur (covers some cases visibility
 * doesn't, e.g. a second on-screen window on the same desktop) as a proxy
 * for "the student left the quiz". This is the strongest practical signal
 * standard browser APIs expose - it cannot see what the student did outside
 * the browser, and a determined student could work around it (a second
 * physical device, for instance), but every ordinary tab/window/app switch
 * is caught. The count and the fail decision are both re-verified
 * server-side (reportTabSwitch) - this component only displays the result.
 *
 * One "departure" (however it's detected) counts once: `awayRef` blocks a
 * second count until the page is visible/focused again, so a single alt-tab
 * that fires both `blur` and `visibilitychange` doesn't double-count.
 */
export function TabSwitchMonitor({
  quizId,
  initialCount,
  maxAllowed,
  onFailed,
}: {
  quizId: string;
  initialCount: number;
  maxAllowed: number;
  onFailed: () => void;
}) {
  const [count, setCount] = useState(initialCount);
  const awayRef = useRef(false);
  const failedRef = useRef(false);

  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  useEffect(() => {
    async function reportDeparture() {
      if (awayRef.current || failedRef.current) return;
      awayRef.current = true;

      const result = await reportTabSwitch(quizId);
      setCount(result.tabSwitchCount);
      if (result.failed) {
        failedRef.current = true;
        onFailed();
      }
    }

    function onVisibilityChange() {
      if (document.hidden) {
        void reportDeparture();
      } else {
        awayRef.current = false;
      }
    }

    function onBlur() {
      if (document.visibilityState === "visible") {
        void reportDeparture();
      }
    }

    function onFocus() {
      awayRef.current = false;
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  const remaining = maxAllowed - count;
  const message =
    count === 0
      ? null
      : count <= maxAllowed
        ? remaining === 1
          ? `Final warning: one more detected switch will fail this quiz.`
          : `Warning: leaving the quiz has been detected.`
        : `This quiz has failed due to excessive tab switching.`;

  return (
    <div className="flex flex-col items-end gap-1">
      <span className="text-xs uppercase tracking-wide text-rahoot-muted">Tab switches</span>
      <span className={`font-mono text-lg font-bold ${count > 0 ? "text-rahoot-red" : ""}`}>
        {count} / {maxAllowed + 1}
      </span>
      {message && <p className="max-w-[16rem] text-right text-xs font-medium text-rahoot-red">{message}</p>}
    </div>
  );
}
