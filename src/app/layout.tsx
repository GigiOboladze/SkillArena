import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeInitScript } from "@/components/ThemeInitScript";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "SkillArena", template: "%s · SkillArena" },
  description: "Self-paced quizzes and a cumulative leaderboard for the whole course.",
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
