"use client";

import { useState } from "react";
import type { HootQuestionType } from "@/generated/prisma/client";

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
 * Choice/True-False use a radio group (native "only one checked" behavior);
 * Multiple Choice swaps to checkboxes. True/False fixes its two options and
 * hides the free-text option inputs entirely, since they're never anything
 * but "True"/"False".
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
  const [optionCount, setOptionCount] = useState(Math.max(defaults?.options.length ?? 4, 2));
  const opts = defaults?.options ?? [];
  const correctSet = new Set(defaults?.correctIndices ?? []);
  const inputType = type === "MULTIPLE_CHOICE" ? "checkbox" : "radio";

  return (
    <form action={action} className="card flex flex-col gap-4 p-6">
      <label className="text-sm font-semibold">
        Question type
        <select
          name="type"
          required
          value={type}
          onChange={(e) => setType(e.target.value as HootQuestionType)}
          className="input mt-1"
        >
          <option value="SINGLE_CHOICE">Single Choice - one correct answer</option>
          <option value="MULTIPLE_CHOICE">Multiple Choice - one or more correct answers</option>
          <option value="TRUE_FALSE">True / False</option>
        </select>
      </label>

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

      {type === "TRUE_FALSE" ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Correct answer</p>
          {[
            { index: 1, label: "True" },
            { index: 2, label: "False" },
          ].map((o) => (
            <label key={o.index} className="flex items-center gap-2">
              <input type="radio" name="correct" value={o.index} required defaultChecked={correctSet.has(o.index)} />
              {o.label}
            </label>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">
            Answers <span className="font-normal text-rahoot-muted">- mark the correct one{type === "MULTIPLE_CHOICE" ? "(s)" : ""}</span>
          </p>
          {Array.from({ length: optionCount }, (_, i) => i + 1).map((i) => (
            <label key={i} className="flex items-center gap-2">
              <input type={inputType} name="correct" value={i} defaultChecked={correctSet.has(i)} />
              <input
                type="text"
                name={`opt${i}`}
                required
                maxLength={200}
                placeholder={`Answer ${i}`}
                defaultValue={opts[i - 1] ?? ""}
                className="input"
              />
            </label>
          ))}
          <div className="flex gap-2">
            {optionCount < MAX_OPTIONS && (
              <button type="button" onClick={() => setOptionCount((n) => n + 1)} className="btn btn-outline !py-1.5 !px-3 text-sm">
                + Add answer
              </button>
            )}
            {optionCount > 2 && (
              <button type="button" onClick={() => setOptionCount((n) => n - 1)} className="btn btn-outline !py-1.5 !px-3 text-sm">
                Remove last answer
              </button>
            )}
          </div>
        </div>
      )}

      {error && ERROR_MESSAGES[error] && <p className="text-sm font-medium text-rahoot-red">{ERROR_MESSAGES[error]}</p>}

      <button type="submit" className="btn btn-primary mt-2">
        {submitLabel}
      </button>
    </form>
  );
}
