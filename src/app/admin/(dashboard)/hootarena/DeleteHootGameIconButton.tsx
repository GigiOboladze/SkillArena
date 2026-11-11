"use client";

/** Trash-can button for the games list; confirms before submitting its form. */
export function DeleteHootGameIconButton({ title }: { title: string }) {
  return (
    <button
      type="submit"
      className="sa-ha-delete"
      aria-label={`Delete ${title}`}
      title="Delete game"
      onClick={(e) => {
        if (!window.confirm(`Delete "${title}" permanently? This deletes every question for it - it can't be undone.`)) {
          e.preventDefault();
        }
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
        <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" />
      </svg>
    </button>
  );
}
