"use client";

export function DeleteHootGameButton({ title }: { title: string }) {
  return (
    <button
      type="submit"
      className="btn border-2 border-rahoot-red bg-rahoot-surface text-rahoot-red hover:bg-rahoot-red hover:text-[color:var(--on-primary)]"
      onClick={(e) => {
        if (!window.confirm(`Delete "${title}" permanently? This deletes every question for it - it can't be undone.`)) {
          e.preventDefault();
        }
      }}
    >
      Delete this game permanently
    </button>
  );
}
