"use client";

import { useState } from "react";

/** Square icon button that copies `value` to the clipboard (shows a tick for a moment). */
export function CopyTextButton({ value, label, className = "sa-hg-copy" }: { value: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      title={copied ? "Copied!" : `Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard blocked (e.g. insecure context) - the value is still on screen.
        }
      }}
    >
      {copied ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
          <rect x="8.5" y="8.5" width="11" height="12" rx="2" />
          <path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2" />
        </svg>
      )}
    </button>
  );
}
