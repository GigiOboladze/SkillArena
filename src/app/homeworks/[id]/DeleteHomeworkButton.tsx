"use client";

export function DeleteHomeworkButton({ title }: { title: string }) {
  return (
    <button
      type="submit"
      className="btn border-2 border-rahoot-red bg-rahoot-surface text-rahoot-red hover:bg-rahoot-red hover:text-[color:var(--on-primary)]"
      onClick={(e) => {
        if (!window.confirm(`Delete "${title}" permanently? This deletes every question, student, and answer for it - it can't be undone.`)) {
          e.preventDefault();
        }
      }}
    >
      Delete this homework permanently
    </button>
  );
}
