// Pure unit test for HootArena's scoring module - no server/database/browser
// needed, just the exported functions. Run: node --import tsx e2e/hootarena-scoring.mjs
import { computeHootPoints, isSelectionCorrect, HOOT_QUESTION_SECONDS, HOOT_BASE_POINTS } from "../src/lib/hootarena/scoring.ts";

const results = [];
function ok(name) { results.push({ name, pass: true }); console.log("PASS:", name); }
function fail(name, err) { results.push({ name, pass: false, err: String(err) }); console.log("FAIL:", name, "-", err); }
function assert(cond, message) { if (!cond) throw new Error(message); }

function test(name, fn) {
  try {
    fn();
    ok(name);
  } catch (err) {
    fail(name, err.message || err);
  }
}

test("incorrect answer always scores 0, regardless of speed", () => {
  assert(computeHootPoints({ isCorrect: false, elapsedMs: 0 }) === 0, "instant incorrect should be 0");
  assert(computeHootPoints({ isCorrect: false, elapsedMs: 19999 }) === 0, "slow incorrect should be 0");
});

test("timeout (no answer) scores 0 - same as any incorrect answer", () => {
  // A timeout is modeled as isCorrect: false, elapsedMs: full time limit.
  assert(computeHootPoints({ isCorrect: false, elapsedMs: HOOT_QUESTION_SECONDS * 1000 }) === 0);
});

test("instant correct answer scores full base points", () => {
  assert(computeHootPoints({ isCorrect: true, elapsedMs: 0 }) === HOOT_BASE_POINTS, "0ms elapsed should score full marks");
});

test("correct answer at the full time limit scores exactly half base points, never less", () => {
  const points = computeHootPoints({ isCorrect: true, elapsedMs: HOOT_QUESTION_SECONDS * 1000 });
  assert(points === HOOT_BASE_POINTS / 2, `expected ${HOOT_BASE_POINTS / 2}, got ${points}`);
});

test("faster correct answers always score strictly more than slower ones", () => {
  const fast = computeHootPoints({ isCorrect: true, elapsedMs: 1000 });
  const mid = computeHootPoints({ isCorrect: true, elapsedMs: 10000 });
  const slow = computeHootPoints({ isCorrect: true, elapsedMs: 19000 });
  assert(fast > mid && mid > slow, `expected fast(${fast}) > mid(${mid}) > slow(${slow})`);
});

test("correct answer score is never negative and never exceeds base points, across the whole range", () => {
  for (let ms = -5000; ms <= 30000; ms += 500) {
    const points = computeHootPoints({ isCorrect: true, elapsedMs: ms });
    assert(points >= HOOT_BASE_POINTS / 2 && points <= HOOT_BASE_POINTS, `elapsedMs=${ms} produced out-of-range score ${points}`);
  }
});

test("negative elapsedMs (clock skew) clamps to the instant-answer score, not an inflated one", () => {
  assert(computeHootPoints({ isCorrect: true, elapsedMs: -1000 }) === HOOT_BASE_POINTS);
});

test("elapsedMs past the deadline clamps to the minimum score, never throws, never scores higher than on-time", () => {
  const atLimit = computeHootPoints({ isCorrect: true, elapsedMs: HOOT_QUESTION_SECONDS * 1000 });
  const wayPast = computeHootPoints({ isCorrect: true, elapsedMs: HOOT_QUESTION_SECONDS * 1000 + 999999 });
  assert(wayPast === atLimit, `expected late answer to clamp to ${atLimit}, got ${wayPast}`);
});

test("score is a deterministic pure function of (isCorrect, elapsedMs) - same inputs, same output", () => {
  const a = computeHootPoints({ isCorrect: true, elapsedMs: 4321 });
  const b = computeHootPoints({ isCorrect: true, elapsedMs: 4321 });
  assert(a === b, "expected repeated calls with identical inputs to agree");
});

test("a custom timeLimitSec is respected instead of the default 20s", () => {
  const points = computeHootPoints({ isCorrect: true, elapsedMs: 5000, timeLimitSec: 10 });
  const expected = Math.round(HOOT_BASE_POINTS * (0.5 + 0.5 * (1 - 5000 / 10000)));
  assert(points === expected, `expected ${expected}, got ${points}`);
});

// ---------- isSelectionCorrect (SINGLE_CHOICE / MULTIPLE_CHOICE / TRUE_FALSE all-or-nothing) ----------

test("single choice: exact match is correct", () => {
  assert(isSelectionCorrect(["a"], ["a"]) === true);
});

test("single choice: wrong option is incorrect", () => {
  assert(isSelectionCorrect(["b"], ["a"]) === false);
});

test("multiple choice: exact set match (any order) is correct", () => {
  assert(isSelectionCorrect(["b", "a"], ["a", "b"]) === true);
});

test("multiple choice: missing one correct option scores incorrect (all-or-nothing, no partial credit)", () => {
  assert(isSelectionCorrect(["a"], ["a", "b"]) === false);
});

test("multiple choice: one extra (incorrect) option added to an otherwise-correct set scores incorrect", () => {
  assert(isSelectionCorrect(["a", "b", "c"], ["a", "b"]) === false);
});

test("empty selection is never correct, even against an (invalid) empty correct set", () => {
  assert(isSelectionCorrect([], []) === false);
  assert(isSelectionCorrect([], ["a"]) === false);
});

test("a duplicated option id in the submitted selection is rejected, not silently deduped into a match", () => {
  assert(isSelectionCorrect(["a", "a"], ["a", "b"]) === false);
});

test("true/false: matches the same exact-set logic (single correct option)", () => {
  assert(isSelectionCorrect(["true-id"], ["true-id"]) === true);
  assert(isSelectionCorrect(["false-id"], ["true-id"]) === false);
});

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILURES:", failed);
  process.exitCode = 1;
}
