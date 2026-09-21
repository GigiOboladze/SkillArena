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
    <form action={action} className="card flex flex-col gap-4 p-6">
      <label className="text-sm font-semibold">
        Question
        <textarea
          name="text"
          required
          maxLength={500}
          rows={2}
          defaultValue={defaults?.text}
          className="input mt-1"
          autoFocus
        />
      </label>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">
          Answers <span className="font-normal text-rahoot-muted">- mark the correct one</span>
        </p>
        {[1, 2, 3, 4].map((i) => (
          <label key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name="correct"
              value={i}
              required
              defaultChecked={defaults?.correctIndex === i}
            />
            <input
              type="text"
              name={`opt${i}`}
              required
              maxLength={200}
              placeholder={`Answer ${i}`}
              defaultValue={opts[i - 1]}
              className="input"
            />
          </label>
        ))}
      </div>

      {error && ERROR_MESSAGES[error] && (
        <p className="text-sm font-medium text-rahoot-red">{ERROR_MESSAGES[error]}</p>
      )}

      <button type="submit" className="btn btn-primary mt-2">
        {submitLabel}
      </button>
    </form>
  );
}
