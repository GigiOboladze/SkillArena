import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

// This page has no per-request data, so Next would otherwise mark it fully
// static and send a year-long s-maxage - which Firebase Hosting's CDN then
// caches at the edge with no way to bust it on a redeploy short of a
// version change. Forcing it dynamic keeps every deploy visible immediately.
export const dynamic = "force-dynamic";

/** Landing page: brand, tagline, one way in, and the two live-session shortcuts. */
export default function Home() {
  return (
    <main className="sa-home">
      <div className="sa-home-bg" aria-hidden>
        <svg className="sa-home-rings" viewBox="0 0 1600 900" preserveAspectRatio="none" fill="none">
          <path d="M310 -4 C 170 70, 60 180, -6 330" />
          <path d="M1606 470 C 1570 690, 1380 860, 1060 906" />
        </svg>
        <span className="sa-home-glow is-a" />
        <span className="sa-home-glow is-b" />
      </div>

      <div className="sa-home-theme">
        <ThemeToggle />
      </div>

      <section className="sa-home-hero">
        <h1 className="sr-only">SkillArena</h1>
        <Logo size={84} priority className="sa-home-logo" />

        <div className="sa-home-motto">
          <svg className="sa-home-arc" viewBox="0 0 720 140" fill="none" aria-hidden preserveAspectRatio="none">
            <defs>
              <linearGradient id="sa-home-arc-g" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#a855f7" stopOpacity="0" />
                <stop offset="0.55" stopColor="#c084fc" stopOpacity="0.9" />
                <stop offset="1" stopColor="#e9d5ff" />
              </linearGradient>
            </defs>
            <path d="M20 135 C 170 40, 430 10, 610 32 C 690 42, 712 70, 690 110" stroke="url(#sa-home-arc-g)" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          <svg className="sa-home-spark" viewBox="0 0 48 48" aria-hidden>
            <path d="M24 2 C26 17 31 22 46 24 C31 26 26 31 24 46 C22 31 17 26 2 24 C17 22 22 17 24 2Z" fill="currentColor" />
          </svg>
          <p className="sa-home-words" aria-label="Learn, compete, grow">
            <span>Learn</span>
            <i aria-hidden>/</i>
            <span>Compete</span>
            <i aria-hidden>/</i>
            <span>Grow</span>
          </p>
        </div>

        <p className="sa-home-tagline">
          Self-paced quizzes after every lecture, one attempt each, a cumulative leaderboard for the whole course.
        </p>

        <Link href="/login" className="sa-home-cta">
          Enter SkillArena
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>

        <div className="sa-home-links">
          <Link href="/join" className="sa-home-pill">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinejoin="round" aria-hidden>
              <path d="M7 4.5v15l12.5-7.5L7 4.5Z" />
            </svg>
            Join a live session
          </Link>
          <Link href="/homeworks/new" className="sa-home-pill">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" aria-hidden>
              <circle cx="12" cy="12" r="1.8" fill="currentColor" />
              <path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.3 5.3a9.5 9.5 0 0 0 0 13.4M18.7 5.3a9.5 9.5 0 0 1 0 13.4" />
            </svg>
            Host a live session
          </Link>
        </div>

        <div className="sa-home-divider" aria-hidden>
          <i className="sa-home-line" />
          <Logo size={34} variant="mark" className="sa-home-divider-mark" />
          <i className="sa-home-line is-right" />
        </div>
      </section>
    </main>
  );
}
