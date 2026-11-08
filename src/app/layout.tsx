import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ThemeInitScript } from "@/components/ThemeInitScript";
import "./globals.css";

// Geist is self-hosted (SIL OFL, see fonts/OFL.txt) rather than loaded via
// next/font/google: the Google variant is downloaded at BUILD time, so a
// Google Fonts hiccup during a Railway build fails the whole deploy. These
// files are the variable fonts subset to Latin - the same range the Google
// "latin" subset served, ~33KB each. Georgian text falls back to the system
// font exactly as before (Geist has no Georgian glyphs).
const geistSans = localFont({
  src: "./fonts/Geist-Latin.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
});

// Mono is only used for a handful of codes/PINs/timers, so it is not
// preloaded on every page - the browser fetches it only where it's used.
const geistMono = localFont({
  src: "./fonts/GeistMono-Latin.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "SkillArena", template: "%s · SkillArena" },
  description: "Self-paced quizzes and a cumulative leaderboard for the whole course.",
};

// viewport-fit=cover lets the phone bottom tab bar sit above the iPhone home
// indicator (env(safe-area-inset-bottom)); themeColor tints the mobile
// browser chrome to match the dark/light page.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0c0c15" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col text-rahoot-ink">
        <ThemeInitScript />
        {children}
      </body>
    </html>
  );
}
