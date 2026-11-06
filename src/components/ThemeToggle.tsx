"use client";

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "./ThemeInitScript";

type Theme = "dark" | "light";

/** Dispatched after this component changes the theme, so every mounted toggle re-reads it. */
const THEME_CHANGE_EVENT = "skillarena:theme-change";

function subscribeToTheme(onChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onChange);
}

/** The live theme, read from the attribute ThemeInitScript set before first paint. */
function readTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

/**
 * `null` during SSR and the hydration render, because the real theme lives in
 * the browser (localStorage -> html[data-theme]) and the server cannot know
 * it. The button renders disabled and fully transparent in that state, which
 * is what keeps a returning light-mode visitor from seeing a flash of the
 * wrong icon.
 */
function readThemeOnServer(): null {
  return null;
}

/**
 * Animated sun/moon theme switch.
 *
 * `html[data-theme]` is external mutable state owned by ThemeInitScript, not
 * by React, so it is read through useSyncExternalStore - the API intended for
 * exactly that. This replaced a useState + "copy the DOM into state on mount"
 * effect, which cost an extra render pass on every mount and is what
 * react-hooks/set-state-in-effect flags. As a side benefit, several toggles on
 * the same page (e.g. a layout's nav plus a fixed one) now stay in sync.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme | null>(subscribeToTheme, readTheme, readThemeOnServer);

  function toggle() {
    const next: Theme = readTheme() === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing / storage disabled - the toggle still works for this page view.
    }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={theme === null}
      aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      data-state={theme ?? "dark"}
      className="theme-toggle"
    >
      <svg viewBox="0 0 24 24" fill="none" className="icon-sun" aria-hidden>
        <circle cx="12" cy="12" r="4.2" fill="currentColor" />
        <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
        </g>
      </svg>
      <svg viewBox="0 0 24 24" fill="none" className="icon-moon" aria-hidden>
        <path
          d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z"
          fill="currentColor"
        />
      </svg>
    </button>
  );
}
