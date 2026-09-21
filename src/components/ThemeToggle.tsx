"use client";

import { useEffect, useState } from "react";
import { THEME_STORAGE_KEY } from "./ThemeInitScript";

type Theme = "dark" | "light";

/**
 * Animated sun/moon theme switch. Reads the real theme from the DOM on
 * mount (already set by ThemeInitScript before paint, so this never causes
 * a flash) rather than assuming dark, then flips html[data-theme] and
 * persists to localStorage on click.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    setTheme(current);
  }, []);

  function toggle() {
    setTheme((prev) => {
      const next: Theme = prev === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Private browsing / storage disabled - the toggle still works for this page view.
      }
      return next;
    });
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
