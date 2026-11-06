import Script from "next/script";

export const THEME_STORAGE_KEY = "skillarena-theme";

export function ThemeInitScript() {
  return (
    <Script id="theme-init" strategy="beforeInteractive">
      {`(function(){try{var t=localStorage.getItem(${JSON.stringify(
        THEME_STORAGE_KEY
      )});if(t!=="light"&&t!=="dark"){t="dark";}document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`}
    </Script>
  );
}
