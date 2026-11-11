"use client";

import { useState } from "react";

/** "PIN 123456" chip that copies the PIN to the clipboard. */
export function CopyPinButton({ pin }: { pin: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="sa-ha-pin"
      aria-label={copied ? `PIN ${pin} copied` : `Copy PIN ${pin}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(pin);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard blocked (e.g. insecure context) - the PIN is still visible to read.
        }
      }}
    >
      <span>PIN {pin}</span>
      {copied ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
          <rect x="8.5" y="8.5" width="11" height="12" rx="2" />
          <path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2" />
        </svg>
      )}
    </button>
  );
}
