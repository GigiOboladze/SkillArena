"use client";

export function DeleteQuizButton({ title }: { title: string }) {
  return (
    <button
      type="submit"
      className="sa-qd-danger"
      onClick={(e) => {
        if (
          !window.confirm(
            `Delete "${title}" permanently? This deletes every question and every student's attempt/score for it - it can't be undone.`
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      Delete this quiz permanently
    </button>
  );
}
