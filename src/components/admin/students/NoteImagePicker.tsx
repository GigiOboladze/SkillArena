"use client";

import { useState } from "react";

/** Image button for the activity-log composer (up to 3 screenshots). */
export function NoteImagePicker() {
  const [count, setCount] = useState(0);
  return (
    <label className="sa-note-image" title="Attach images">
      <input
        type="file"
        name="images"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        className="sr-only"
        onChange={(e) => setCount(e.target.files?.length ?? 0)}
      />
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden>
        <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
        <circle cx="9" cy="10" r="1.75" />
        <path d="m20.5 16-5-5-8 8.5" />
      </svg>
      {count > 0 && <span className="sa-note-image-count">{count}</span>}
      <span className="sr-only">Attach images</span>
    </label>
  );
}
