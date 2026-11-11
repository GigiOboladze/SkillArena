"use client";

import { Select } from "@/components/ui/Select";
import { useState } from "react";
import type { HootQuestionType } from "@/generated/prisma/client";
import { AnswersEditor } from "@/components/admin/questions/AnswersEditor";

const ERROR_MESSAGES: Record<string, string> = {
  text: "Please enter the question text.",
  type: "Please choose a question type.",
  options: "Add at least 2 answers.",
  correct: "Mark the correct answer(s): exactly one for Single Choice and True/False, at least one for Multiple Choice.",
};

const MAX_OPTIONS = 6;

export type HootQuestionDefaults = {
  type: HootQuestionType;
  text: string;
  options: string[]; // up to MAX_OPTIONS, ignored for TRUE_FALSE
  correctIndices: number[]; // 1-based
};

/**
 * Shared question form for all three HootArena question types. Single
 * Choice/True-False use a radio group; Multiple Choice swaps to checkboxes.
 * True/False fixes its two options (they're never anything but
 * "True"/"False"), so it shows just the two choices to pick from.
 */
export function HootQuestionForm({
  action,
  defaults,
  error,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaults?: HootQuestionDefaults;
  error?: string | null;
  submitLabel: string;
}) {
  const [type, setType] = useState<HootQuestionType>(defaults?.type ?? "SINGLE_CHOICE");
  const [tfCorrect, setTfCorrect] = useState<number | null>(
    defaults?.type === "TRUE_FALSE" ? (defaults.correctIndices[0] ?? null) : null,
  );
  const answerDefaults = defaults && defaults.type !== "TRUE_FALSE" ? defaults : undefined;

  return (
    <form action={action} className="sa-qf-card sa-qf-hoot">
      <div className="sa-qf-main">
        <label className="sa-qf-label" htmlFor="qf-type">
          Question Type
        </label>
        <span className="sa-am-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="sa-am-input-icon" aria-hidden>
            <path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" />
            <path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5" />
          </svg>
          <Select
            id="qf-type"
            name="type"
            required
            value={type}
            onChange={(e) => setType(e.target.value as HootQuestionType)}
            className="sa-am-input sa-am-select !font-semibold"
          >
            <option value="SINGLE_CHOICE">Single Choice – one correct answer</option>
            <option value="MULTIPLE_CHOICE">Multiple Choice – one or more correct answers</option>
            <option value="TRUE_FALSE">True / False</option>
          </Select>
        </span>

        <label className="sa-qf-label mt-6" htmlFor="qf-text">
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

        {type === "TRUE_FALSE" ? (
          <>
            <p className="sa-qf-label mt-6">Correct Answer</p>
            <p className="mb-4 text-sm text-rahoot-muted">Is the statement true or false?</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { index: 1, label: "True" },
                { index: 2, label: "False" },
              ].map((o) => (
                <label key={o.index} className={`sa-qf-tf ${tfCorrect === o.index ? "is-correct" : ""}`}>
                  <input
                    type="radio"
                    name="correct"
                    value={o.index}
                    required
                    checked={tfCorrect === o.index}
                    onChange={() => setTfCorrect(o.index)}
                  />
                  <span className="sa-qa-dot" aria-hidden />
                  {o.label}
                </label>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="sa-qf-label mt-6">Answers</p>
            <p className="mb-4 text-sm text-rahoot-muted">
              {type === "MULTIPLE_CHOICE"
                ? "Select every correct answer by clicking its circle."
                : "Select the correct answer by clicking the circle."}
            </p>
            <AnswersEditor
              multiple={type === "MULTIPLE_CHOICE"}
              min={2}
              max={MAX_OPTIONS}
              defaultAnswers={answerDefaults?.options}
              defaultCorrect={answerDefaults?.correctIndices}
            />
          </>
        )}

        {error && ERROR_MESSAGES[error] && (
          <p role="alert" className="mt-4 text-sm font-medium text-rahoot-red">
            {ERROR_MESSAGES[error]}
          </p>
        )}
      </div>

      <button type="submit" className="sa-qf-submit">
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
          <path d="M7 4.5v15l12.5-7.5Z" fill="currentColor" />
        </svg>
        {submitLabel}
      </button>
    </form>
  );
}
