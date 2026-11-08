const ERROR_MESSAGES: Record<string, string> = {
  text: "Please enter the question text.",
  options: "All 4 answers are required.",
  correct: "Pick which answer is correct.",
};

export type QuizQuestionDefaults = {
  text: string;
  options: string[]; // exactly 4
  correctIndex: number | null; // 1-based
};

/**
 * Question form for QUIZ-mode homeworks: always multiple choice, always
 * exactly 4 required answers, no points/time-limit inputs - those are fixed
 * platform-wide (1 point, 100 seconds) rather than admin-configurable.
 */
export function QuizQuestionForm({
  action,
  defaults,
  error,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaults?: QuizQuestionDefaults;
  error?: string | null;
  submitLabel: string;
}) {
  const opts = defaults?.options ?? ["", "", "", ""];
  while (opts.length < 4) opts.push("");

  return (
    <form action={action} className="sa-qn-card !mt-6 sa-qq">
      <label className="sa-qn-label !text-lg">
        Question
        <textarea
          name="text"
          required
          maxLength={500}
          rows={3}
          defaultValue={defaults?.text}
          className="sa-qq-textarea"
          autoFocus
        />
      </label>

      <fieldset className="mt-7">
        <legend className="text-lg font-bold text-rahoot-ink">
          Answers <span className="font-normal">&ndash; mark the correct one</span>
        </legend>
        <div className="mt-4 flex flex-col gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="sa-qq-row">
              <input
                type="text"
                name={`opt${i}`}
                required
                maxLength={200}
                placeholder={`Answer ${i}`}
                aria-label={`Answer ${i}`}
                defaultValue={opts[i - 1]}
                className="sa-qq-answer"
              />
              <label className="sa-qq-correct">
                <input
                  type="radio"
                  name="correct"
                  value={i}
                  required
                  defaultChecked={defaults?.correctIndex === i}
                  aria-label={`Answer ${i} is correct`}
                />
                <svg viewBox="0 0 24 24" fill="none" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 flex-none" aria-hidden>
                  <circle cx="12" cy="12" r="9.5" className="sa-qq-ring" />
                  <path d="m8 12.3 2.7 2.7L16.2 9.5" className="sa-qq-tick" />
                </svg>
                Correct answer
              </label>
            </div>
          ))}
        </div>
      </fieldset>

      {error && ERROR_MESSAGES[error] && (
        <p className="mt-4 text-sm font-medium text-rahoot-red">{ERROR_MESSAGES[error]}</p>
      )}

      <button type="submit" className="sa-qn-submit !mt-6">
        {submitLabel}
      </button>
    </form>
  );
}
