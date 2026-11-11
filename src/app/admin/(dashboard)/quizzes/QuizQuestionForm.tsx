import { AnswersEditor } from "@/components/admin/questions/AnswersEditor";
import { QuestionArt } from "@/components/admin/questions/QuestionArt";

const ERROR_MESSAGES: Record<string, string> = {
  text: "Please enter the question text.",
  options: "Add 2 to 4 answers - none of them can be empty.",
  correct: "Pick which answer is correct.",
};

export type QuizQuestionDefaults = {
  text: string;
  options: string[]; // 2-4
  correctIndex: number | null; // 1-based
};

export const QUIZ_MIN_ANSWERS = 2;
export const QUIZ_MAX_ANSWERS = 4;

/**
 * Question form for QUIZ-mode homeworks: one correct answer out of 2-4, no
 * points/time-limit inputs - those are fixed platform-wide (1 point, 100
 * seconds) rather than admin-configurable.
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
  return (
    <form action={action} className="sa-qf-card sa-qf-quiz">
      <div className="sa-qf-main">
        <label className="sa-qf-label" htmlFor="qf-text">
          Question
        </label>
        <textarea
          id="qf-text"
          name="text"
          required
          maxLength={500}
          rows={3}
          defaultValue={defaults?.text}
          placeholder="Enter your question..."
          className="sa-qf-textarea"
          autoFocus
        />

        <p className="sa-qf-label mt-6">Answers</p>
        <p className="mb-4 text-sm text-rahoot-muted">Select the correct answer by clicking the circle.</p>
        <AnswersEditor
          min={QUIZ_MIN_ANSWERS}
          max={QUIZ_MAX_ANSWERS}
          defaultAnswers={defaults?.options}
          defaultCorrect={defaults?.correctIndex ? [defaults.correctIndex] : []}
        />

        {error && ERROR_MESSAGES[error] && (
          <p role="alert" className="mt-4 text-sm font-medium text-rahoot-red">
            {ERROR_MESSAGES[error]}
          </p>
        )}
      </div>

      <aside className="sa-qf-side">
        <QuestionArt className="sa-qf-art" />
        <div className="sa-qf-tip">
          <span className="sa-qf-tip-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
              <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3Z" />
            </svg>
          </span>
          <div>
            <p className="font-bold">Tip</p>
            <p className="mt-0.5 text-sm text-rahoot-muted">
              Write a clear question and provide {QUIZ_MIN_ANSWERS}&ndash;{QUIZ_MAX_ANSWERS} answer options.
            </p>
          </div>
        </div>
      </aside>

      <button type="submit" className="sa-qf-submit">
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
          <path d="M7 4.5v15l12.5-7.5Z" fill="currentColor" />
        </svg>
        {submitLabel}
      </button>
    </form>
  );
}
