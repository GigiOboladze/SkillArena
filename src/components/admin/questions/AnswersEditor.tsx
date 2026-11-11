"use client";

import { useState } from "react";

type Row = { id: number; text: string };

/**
 * Answer list for the Add/Edit Question forms (quizzes and HootArena).
 *
 * Inputs are posted by position - opt1, opt2, ... and `correct` = the
 * 1-based position(s) of the right answer(s) - which is exactly what the
 * existing server actions parse, so rows can be added, removed and dragged
 * into a new order freely before saving.
 */
export function AnswersEditor({
  multiple = false,
  min = 2,
  max = 4,
  defaultAnswers,
  defaultCorrect,
}: {
  /** Checkboxes (several correct answers) instead of a single radio choice. */
  multiple?: boolean;
  min?: number;
  max?: number;
  defaultAnswers?: string[];
  /** 1-based positions of the correct answers. */
  defaultCorrect?: number[];
}) {
  // Row ids come from a counter kept in state (not a ref), so they are never read during render.
  const [state, setState] = useState(() => {
    const texts = defaultAnswers && defaultAnswers.length > 0 ? defaultAnswers.slice(0, max) : Array.from({ length: Math.min(4, max) }, () => "");
    while (texts.length < min) texts.push("");
    const rows: Row[] = texts.map((text, i) => ({ id: i, text }));
    const correct = (defaultCorrect ?? []).map((i) => rows[i - 1]?.id).filter((id): id is number => id !== undefined);
    return { rows, correct, nextId: rows.length };
  });
  const [dragId, setDragId] = useState<number | null>(null);
  const { rows } = state;
  // Switching a HootArena question from Multiple to Single Choice keeps just the first pick.
  const correct = multiple ? state.correct : state.correct.slice(0, 1);

  const setText = (id: number, text: string) => setState((s) => ({ ...s, rows: s.rows.map((r) => (r.id === id ? { ...r, text } : r)) }));
  const toggleCorrect = (id: number) =>
    setState((s) => ({
      ...s,
      correct: multiple ? (s.correct.includes(id) ? s.correct.filter((c) => c !== id) : [...s.correct, id]) : [id],
    }));
  const addRow = () =>
    setState((s) => (s.rows.length >= max ? s : { ...s, rows: [...s.rows, { id: s.nextId, text: "" }], nextId: s.nextId + 1 }));
  const removeRow = (id: number) =>
    setState((s) => (s.rows.length <= min ? s : { ...s, rows: s.rows.filter((r) => r.id !== id), correct: s.correct.filter((c) => c !== id) }));
  const moveRow = (fromId: number, toId: number) =>
    setState((s) => {
      const from = s.rows.findIndex((r) => r.id === fromId);
      const to = s.rows.findIndex((r) => r.id === toId);
      if (from < 0 || to < 0 || from === to) return s;
      const rows = [...s.rows];
      const [moved] = rows.splice(from, 1);
      rows.splice(to, 0, moved);
      return { ...s, rows };
    });

  return (
    <div className="sa-qa">
      <ul className="flex flex-col gap-2.5">
        {rows.map((row, i) => {
          const isCorrect = correct.includes(row.id);
          return (
            <li
              key={row.id}
              className={`sa-qa-row ${isCorrect ? "is-correct" : ""} ${dragId === row.id ? "is-dragging" : ""}`}
              onDragOver={(e) => {
                if (dragId !== null) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId !== null) moveRow(dragId, row.id);
                setDragId(null);
              }}
            >
              <label className="sa-qa-pick" title={multiple ? "Mark as a correct answer" : "Mark as the correct answer"}>
                <input
                  type={multiple ? "checkbox" : "radio"}
                  name="correct"
                  value={i + 1}
                  checked={isCorrect}
                  onChange={() => toggleCorrect(row.id)}
                  required={!multiple}
                  aria-label={`Answer ${i + 1} is correct`}
                />
                <span className="sa-qa-dot" aria-hidden />
              </label>
              <span className="sa-qa-field">
                <input
                  type="text"
                  name={`opt${i + 1}`}
                  required
                  maxLength={200}
                  placeholder={`Answer ${i + 1}`}
                  aria-label={`Answer ${i + 1}`}
                  value={row.text}
                  onChange={(e) => setText(row.id, e.target.value)}
                />
                <span
                  className="sa-qa-grip"
                  draggable
                  onDragStart={(e) => {
                    setDragId(row.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(row.id));
                  }}
                  onDragEnd={() => setDragId(null)}
                  title="Drag to reorder"
                  aria-hidden
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                    <circle cx="9" cy="6" r="1.6" />
                    <circle cx="15" cy="6" r="1.6" />
                    <circle cx="9" cy="12" r="1.6" />
                    <circle cx="15" cy="12" r="1.6" />
                    <circle cx="9" cy="18" r="1.6" />
                    <circle cx="15" cy="18" r="1.6" />
                  </svg>
                </span>
              </span>
              <button
                type="button"
                className="sa-qa-trash"
                onClick={() => removeRow(row.id)}
                disabled={rows.length <= min}
                aria-label={`Remove answer ${i + 1}`}
                title={rows.length <= min ? `At least ${min} answers are needed` : "Remove this answer"}
              >
                <TrashIcon />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" className="sa-qa-btn" onClick={addRow} disabled={rows.length >= max} title={rows.length >= max ? `Up to ${max} answers` : undefined}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className="h-5 w-5" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add Answer
          </button>
          <button
            type="button"
            className="sa-qa-btn"
            onClick={() => removeRow(rows[rows.length - 1].id)}
            disabled={rows.length <= min}
            title={rows.length <= min ? `At least ${min} answers are needed` : undefined}
          >
            <TrashIcon />
            Remove Last Answer
          </button>
      </div>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
      <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" />
    </svg>
  );
}
