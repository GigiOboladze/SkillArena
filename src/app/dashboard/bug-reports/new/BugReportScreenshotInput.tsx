"use client";

import { useRef, useState } from "react";

const MAX_FILES = 2;

/**
 * A single file input that silently truncates to MAX_FILES (rebuilding the
 * input's own FileList via DataTransfer) and shows local previews -
 * server-side validation (src/lib/bug-reports.ts) is the real enforcement;
 * this is just so a student never has to guess why an extra file "didn't
 * count".
 */
export function BugReportScreenshotInput() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_FILES);

    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    if (inputRef.current) inputRef.current.files = dt.files;

    previews.forEach((url) => URL.revokeObjectURL(url));
    setPreviews(files.map((f) => URL.createObjectURL(f)));
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        name="screenshots"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        onChange={handleChange}
        className="input"
      />
      <p className="mt-1 text-xs text-rahoot-muted">You can upload up to {MAX_FILES} screenshots.</p>
      {previews.length > 0 && (
        <div className="mt-3 flex gap-3">
          {previews.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- local blob preview, not an optimizable remote asset
            <img
              key={src}
              src={src}
              alt={`Screenshot ${i + 1} preview`}
              className="h-24 w-24 rounded-lg border border-rahoot-border object-cover"
            />
          ))}
        </div>
      )}
    </div>
  );
}
