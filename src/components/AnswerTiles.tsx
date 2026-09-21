"use client";

import type { ReactNode } from "react";

export type OptionState = "idle" | "selected" | "dimmed";

/**
 * One answer tile: black surface with a violet outline while choosing,
 * turning fully solid violet (with a bouncy pop animation) the instant
 * it's picked - `state` drives it. "selected" stays applied through
 * submission and the wait for others, so the choice keeps reading clearly
 * rather than being replaced by a plain text message. "dimmed" fades every
 * other tile once a choice is locked in. Just the answer text, centered -
 * no letter badge.
 */
export function OptionTile({
  children,
  state = "idle",
  onClick,
  className = "",
}: {
  children: ReactNode;
  state?: OptionState;
  onClick?: () => void;
  className?: string;
}) {
  const interactive = state === "idle" && !!onClick;

  return (
    <button
      type="button"
      onClick={interactive ? onClick : undefined}
      disabled={!interactive}
      aria-pressed={state === "selected"}
      className={`relative flex min-h-16 items-center justify-center rounded-2xl border-2 p-4 text-center font-bold transition-all duration-150 ease-out sm:min-h-20 ${
        state === "selected"
          ? "border-rahoot-red bg-rahoot-red text-[#fbfaff] shadow-lg"
          : "border-rahoot-red bg-rahoot-surface text-rahoot-red"
      } ${interactive ? "cursor-pointer hover:bg-rahoot-red-light active:scale-95" : "cursor-default"} ${
        state === "dimmed" ? "opacity-30" : ""
      } ${state === "selected" ? "tile-pop" : ""} ${className}`}
    >
      <span className="text-sm leading-snug sm:text-base">{children}</span>
      {state === "selected" && (
        <span className="absolute right-3 text-xl leading-none" aria-hidden>
          ✓
        </span>
      )}
    </button>
  );
}

/** Always 2 columns, even on mobile - answer tiles read fine at that width and it keeps the 2x2 layout for the common 4-option case on every screen size. */
export function OptionGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}
