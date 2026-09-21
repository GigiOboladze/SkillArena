import Script from "next/script";

export const THEME_STORAGE_KEY = "skillarena-theme";

/**
 * Sets html[data-theme] from localStorage before the page paints, so a
 * returning visitor never sees a flash of the wrong theme. `beforeInteractive`
 * makes Next hoist this into <head> and run it ahead of hydration/paint,
 * regardless of where it's rendered in the tree.
 */
export function ThemeInitScript() {
  return (
    <Script id="theme-init" strategy="beforeInteractive">
      {`(function(){try{var t=localStorage.getItem(${JSON.stringify(
        THEME_STORAGE_KEY
      )});if(t!=="light"&&t!=="dark"){t="dark";}document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`}
    </Script>
  );
}
