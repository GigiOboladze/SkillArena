"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef } from "react";
import { QuizTimer } from "@/components/QuizTimer";
import { TabSwitchMonitor } from "@/components/TabSwitchMonitor";
import { QUIZ_MAX_TAB_SWITCHES } from "@/lib/quiz-constants";

export function QuestionClientControls({
  quizId,
  initialRemainingSeconds,
  expired,
  nextHref,
  tabSwitchCount,
}: {
  quizId: string;
  initialRemainingSeconds: number;
  expired: boolean;
  nextHref: string;
  tabSwitchCount: number;
}) {
  const router = useRouter();
  const navigatedRef = useRef(false);

  const goNext = useCallback(() => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    router.push(nextHref);
    router.refresh();
  }, [router, nextHref]);

  const goToResult = useCallback(() => {
    router.push(`/quiz/${quizId}/result`);
  }, [router, quizId]);

  return (
    <div className="flex items-start justify-between gap-4">
      {expired ? (
        <div className="flex flex-col items-center">
          <span className="text-xs uppercase tracking-wide text-rahoot-muted">Time remaining</span>
          <span className="font-mono text-3xl font-black text-rahoot-red">0</span>
        </div>
      ) : (
        <QuizTimer initialRemainingSeconds={initialRemainingSeconds} onExpire={goNext} />
      )}
      <TabSwitchMonitor
        quizId={quizId}
        initialCount={tabSwitchCount}
        maxAllowed={QUIZ_MAX_TAB_SWITCHES}
        onFailed={goToResult}
      />
    </div>
  );
}
