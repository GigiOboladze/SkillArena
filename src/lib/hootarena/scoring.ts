// Centralized, server-only scoring logic for HootArena - the single source
// of truth for "how many points did this answer earn", kept deliberately
// separate from the legacy LIVE-mode formula in `@/lib/scoring` even though
// the shape is similar, so HootArena's own tests and future tuning never
// risk touching the ordinary quiz/live-homework scoring behavior.

// Every HootArena question runs on the same fixed clock - see the product
// requirement ("the user specifically wants 20 seconds") - so this isn't a
// per-question setting anywhere in the schema, just this one constant.
export const HOOT_QUESTION_SECONDS = 20;

// Full marks for an instant-correct answer. Matches the legacy Question
// model's own default (`points Int @default(1000)`) purely for familiarity
// across the app - HootArena questions don't carry a per-question point
// value in the schema, so this is the one fixed base for all of them.
export const HOOT_BASE_POINTS = 1000;

/**
 * Kahoot-style speed-scaled points for a single answer.
 * - Incorrect (or no answer / timeout): always 0 - never negative.
 * - Correct: scales from 100% of base points at 0ms elapsed down to 50% of
 *   base points at the full time limit - faster is strictly better, slower
 *   is never worse than half credit, and the result is fully deterministic
 *   from (isCorrect, elapsedMs) alone so it can never be influenced by
 *   anything the client claims about itself.
 *
 * `elapsedMs` is clamped into [0, timeLimitMs] before scoring so a
 * negative/garbage value (clock skew, a malformed payload) can't produce a
 * score outside the intended [50%, 100%] correct-answer range, and a value
 * past the deadline that somehow still reaches this function (defense in
 * depth - callers should already be rejecting late answers before this is
 * even called) scores as the minimum rather than throwing.
 */
export function computeHootPoints(params: {
  isCorrect: boolean;
  elapsedMs: number;
  timeLimitSec?: number;
}): number {
  const { isCorrect, elapsedMs } = params;
  if (!isCorrect) return 0;

  const timeLimitSec = params.timeLimitSec ?? HOOT_QUESTION_SECONDS;
  const timeLimitMs = Math.max(timeLimitSec, 1) * 1000;
  const clampedElapsedMs = Math.min(Math.max(elapsedMs, 0), timeLimitMs);
  const remainingFraction = 1 - clampedElapsedMs / timeLimitMs;

  return Math.round(HOOT_BASE_POINTS * (0.5 + 0.5 * remainingFraction));
}

/**
 * Whether a submitted set of option ids exactly matches the question's
 * correct-option set - used identically for SINGLE_CHOICE, MULTIPLE_CHOICE,
 * and TRUE_FALSE (all three are "does the selected set equal the correct
 * set", just with different cardinality of the correct set). An empty
 * selection is never correct, even if a question were somehow configured
 * with zero correct options (that configuration is itself rejected at
 * question-creation time - see hootarena/questions.ts - this is defense in
 * depth against it ever mattering at scoring time).
 *
 * Per-project decision (documented for the multiple-choice case in the spec
 * this feature was built against): partial credit is never awarded. Any
 * missing or extra option relative to the correct set scores as fully
 * incorrect (0 points), not partial.
 */
export function isSelectionCorrect(selectedOptionIds: string[], correctOptionIds: string[]): boolean {
  if (selectedOptionIds.length === 0 || correctOptionIds.length === 0) return false;
  if (selectedOptionIds.length !== correctOptionIds.length) return false;

  const correctSet = new Set(correctOptionIds);
  const seen = new Set<string>();
  for (const id of selectedOptionIds) {
    if (!correctSet.has(id)) return false;
    if (seen.has(id)) return false; // reject a client sending the same option id twice
    seen.add(id);
  }
  return true;
}
