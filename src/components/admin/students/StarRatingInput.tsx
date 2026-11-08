"use client";

import { useState } from "react";

/**
 * Click-to-rate 1-5 stars, submitted as `communicationSkill`. "Clear"
 * submits 0 (= not rated). With `optional` and nothing chosen, the field is
 * simply not sent, so an untouched form never overwrites anything.
 */
export function StarRatingInput({ defaultValue, allowClear = false }: { defaultValue?: number | null; allowClear?: boolean }) {
  const [value, setValue] = useState<number>(defaultValue ? Math.round(defaultValue) : 0);
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="sa-star-input" onMouseLeave={() => setHover(0)}>
      {value > 0 || allowClear ? <input type="hidden" name="communicationSkill" value={value} /> : null}
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          aria-pressed={value === n}
          className={n <= shown ? "is-on" : undefined}
          onMouseEnter={() => setHover(n)}
          onClick={() => setValue(value === n ? 0 : n)}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="m12 2.8 2.75 5.6 6.15.9-4.45 4.33 1.05 6.12L12 16.87l-5.5 2.88 1.05-6.12L3.1 9.3l6.15-.9L12 2.8Z" />
          </svg>
        </button>
      ))}
    </div>
  );
}
