import type React from "react";
import Link from "next/link";
import { Avatar } from "./Avatar";
import {
  IconArrowRight,
  IconBolt,
  IconCheck,
  IconClock,
  IconStar,
  IconTrophy,
  IconX,
} from "./Icons";
import { NewsCarousel } from "./NewsCarousel";
import { ScheduleIcon } from "./ScheduleIcon";
import { SCHEDULE_VIEWS, formatDays, type ScheduleView } from "@/lib/schedule";
import type { NewsItem } from "@/lib/news";

/**
 * Purely presentational student dashboard. All data is fetched and all
 * eligibility decided in `app/dashboard/page.tsx`; this file only lays it
 * out. Keeping it data-in / markup-out means it can be rendered with sample
 * data for design review without a database.
 */

export type DashboardQuiz = { id: string; title: string; subjectName: string | null; questionCount: number };
export type DashboardInProgress = { id: string; homeworkId: string; title: string };
export type DashboardCompleted = {
  id: string;
  homeworkId: string;
  title: string;
  failed: boolean;
  score: number;
  totalQuestions: number;
};
export type DashboardActivity = { id: string; title: string; failed: boolean; points: number; ago: string };
export type DashboardStanding = {
  studentId: string;
  firstName: string;
  lastName: string;
  totalScore: number;
  rank: number;
};

export type DashboardScheduleEntry = {
  id: string;
  title: string;
  days: number[];
  startTime: string;
  endTime: string;
  room: string | null;
  tone: string;
  icon: string;
};

export type DashboardViewProps = {
  studentId: string;
  firstName: string;
  programName: string | null;
  totalScore: number;
  pointsThisWeek: number;
  completedInProgram: number;
  completedThisWeek: number;
  rank: number; // 0 = not ranked
  rankedCount: number;
  ungroupedSubjects: { id: string; subjectName: string }[];
  inProgress: DashboardInProgress[];
  available: DashboardQuiz[];
  completed: DashboardCompleted[];
  activity: DashboardActivity[];
  standings: DashboardStanding[]; // top 3, plus the current student if outside it
  schedule: DashboardScheduleEntry[]; // already filtered for scheduleView
  scheduleView: ScheduleView;
  hasAnySchedule: boolean;
  news: NewsItem[];
  newsIntervalMs: number;
};

// How many available quizzes show before "Show all".
const QUIZ_PREVIEW = 6;

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};
function IconCalendar({ className }: { className?: string }) {
  return (
    <svg {...svgProps} className={className}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}
function IconPin({ className }: { className?: string }) {
  return (
    <svg {...svgProps} className={className}>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}
function IconChevronDown({ className }: { className?: string }) {
  return (
    <svg {...svgProps} className={className}>
      <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />
    </svg>
  );
}
function IconMegaphone({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M4 12.5c0-1.4 1.1-2.5 2.5-2.5H11l11-6v24l-11-6H6.5A2.5 2.5 0 0 1 4 19.5v-7Z" fill="currentColor" />
      <path d="M10 22l2.2 6.2c.3.9 1.4 1.3 2.2.8l1.3-.8c.6-.4.8-1.2.5-1.9L13.6 22" fill="currentColor" opacity=".75" />
      <path d="M25.5 12.5a4.5 4.5 0 0 1 0 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function ClassSchedule({ entries, view, hasAny }: { entries: DashboardScheduleEntry[]; view: ScheduleView; hasAny: boolean }) {
  const current = SCHEDULE_VIEWS.find((v) => v.key === view) ?? SCHEDULE_VIEWS[0];
  return (
    <section className="sa-panel sa-sched" aria-labelledby="sched-title">
      <header className="sa-sched-head">
        <div className="flex min-w-0 items-start gap-3">
          <IconCalendar className="mt-0.5 h-8 w-8 flex-none text-[#a78bfa]" />
          <div className="min-w-0">
            <h2 id="sched-title" className="text-xl font-black tracking-tight sm:text-2xl">
              Class Schedule
            </h2>
            <p className="mt-0.5 text-sm text-rahoot-muted">Your weekly classes, time and room assignments.</p>
          </div>
        </div>
        <details className="sa-sched-pick">
          <summary aria-label={`Showing: ${current.label}. Change`}>
            <IconCalendar className="h-[18px] w-[18px] text-rahoot-muted" />
            <span>{current.label}</span>
            <IconChevronDown className="h-4 w-4 text-rahoot-muted" />
          </summary>
          <div className="sa-sched-menu" role="menu">
            {SCHEDULE_VIEWS.map((v) => (
              <Link
                key={v.key}
                role="menuitem"
                href={v.key === "week" ? "/dashboard" : `/dashboard?schedule=${v.key}`}
                scroll={false}
                className={v.key === view ? "is-active" : undefined}
              >
                {v.label}
              </Link>
            ))}
          </div>
        </details>
      </header>

      {entries.length === 0 ? (
        <p className="sa-sched-empty">
          {hasAny
            ? view === "today"
              ? "No classes today - enjoy the free time!"
              : "No classes tomorrow."
            : "Your class schedule hasn't been added yet. It will appear here once your instructor sets it up."}
        </p>
      ) : (
        <ul className="sa-sched-list">
          {entries.map((e) => (
            <li key={e.id} className={`sa-sched-row is-${e.tone}`}>
              <span className="sa-sched-icon" aria-hidden>
                <ScheduleIcon icon={e.icon} className="h-6 w-6" />
              </span>
              <p className="sa-sched-title">{e.title}</p>
              <span className="sa-sched-sep" aria-hidden />
              <p className="sa-sched-meta">
                <IconCalendar className="h-[18px] w-[18px]" />
                <span className="sr-only">Days: </span>
                {formatDays(e.days)}
              </p>
              <p className="sa-sched-meta">
                <IconClock className="h-[18px] w-[18px]" />
                <span className="sr-only">Time: </span>
                {e.startTime} &ndash; {e.endTime}
              </p>
              <p className="sa-sched-meta">
                <IconPin className="h-[18px] w-[18px]" />
                <span className="sr-only">Room: </span>
                {e.room ?? "TBA"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CoolNews({ items, intervalMs }: { items: NewsItem[]; intervalMs: number }) {
  return (
    <section className="sa-panel sa-news" aria-labelledby="news-title">
      <header className="flex items-center justify-between gap-3">
        <h2 id="news-title" className="flex items-center gap-3 text-xl font-black tracking-tight sm:text-2xl">
          <IconMegaphone className="h-8 w-8 flex-none text-[#f5b82e]" />
          <span className="relative">
            Cool News!!
            <svg viewBox="0 0 24 24" className="sa-news-spark" aria-hidden>
              <path d="M5 4.5 7 10M11 7.5l-2.5 4.5M10.5 15.5l7-2.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </span>
        </h2>
        <Link href="/dashboard/news" className="sa-news-all">
          View all news <IconArrowRight className="h-4 w-4" />
        </Link>
      </header>
      <NewsCarousel items={items} intervalMs={intervalMs} />
    </section>
  );
}


// Subject tiles get a stable colour from their name so "JavaScript" is always the same tile.
const TILE_HUES = [265, 45, 330, 190, 145, 15, 220];
function tileHue(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TILE_HUES[h % TILE_HUES.length];
}
function tileLabel(name: string) {
  const words = name.trim().split(/\s+/);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}

function Delta({ value, suffix }: { value: number; suffix: string }) {
  if (value <= 0) return null;
  return (
    <span className="sa-delta">
      <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
        <path d="M6 2.5 10 7H7v2.5H5V7H2l4-4.5Z" fill="currentColor" />
      </svg>
      +{value} {suffix}
    </span>
  );
}

export function DashboardView(p: DashboardViewProps) {
  const next = p.inProgress[0]
    ? { href: `/quiz/${p.inProgress[0].homeworkId}`, label: "Resume your quiz" }
    : p.available[0]
      ? { href: `/quiz/${p.available[0].id}`, label: "Start your next quiz" }
      : { href: "/dashboard/leaderboard", label: "See where you stand" };

  const quizPreview = p.available.slice(0, QUIZ_PREVIEW);
  const quizRest = p.available.slice(QUIZ_PREVIEW);

  return (
    <div className="sa-dash flex flex-col gap-5">
      {/* ---------------- Hero ---------------- */}
      <section className="sa-hero sa-dash-hero">
        <div className="relative z-10 flex flex-col gap-1.5 px-7 py-6 sm:px-9">
          <h1 className="text-3xl font-black leading-tight tracking-tight sm:text-[2.6rem]">
            Welcome back, {p.firstName}! <span aria-hidden>👑</span>
          </h1>
          {p.programName && <p className="text-base font-medium text-rahoot-muted sm:text-lg">{p.programName}</p>}
          <Link href={next.href} className="sa-hero-cta group mt-2">
            <span>{next.label} and earn more points!</span>
            <span className="sa-round-btn">
              <IconArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        </div>
        {/* Decorative light wave; the pet / character artwork will sit here later. */}
        <div className="sa-hero-stage" data-pet-slot aria-hidden>
          <svg className="sa-hero-wave" viewBox="0 0 600 200" preserveAspectRatio="none">
            <defs>
              <linearGradient id="sa-wave-g" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="#7c5cff" stopOpacity="0" />
                <stop offset=".45" stopColor="#8b6bff" stopOpacity=".9" />
                <stop offset="1" stopColor="#c4b5fd" stopOpacity=".25" />
              </linearGradient>
            </defs>
            <path d="M0 175 C 150 175, 220 120, 330 105 S 520 60, 600 0" fill="none" stroke="url(#sa-wave-g)" strokeWidth="3" />
            <path d="M0 190 C 160 190, 240 140, 350 122 S 530 85, 600 25" fill="none" stroke="url(#sa-wave-g)" strokeWidth="1.4" opacity=".55" />
            <path d="M0 200 C 170 200, 260 160, 370 140 S 540 110, 600 55" fill="none" stroke="url(#sa-wave-g)" strokeWidth="1" opacity=".35" />
          </svg>
        </div>
      </section>

      {/* ---------------- Stats ---------------- */}
      <section className="sa-dash-stats grid grid-cols-1 gap-4 sm:grid-cols-3" aria-label="Your stats">
        <div className="sa-stat">
          <span className="sa-stat-icon is-gold">
            <IconStar className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="sa-stat-label">Total points</p>
            <div className="flex flex-wrap items-baseline gap-x-2.5">
              <span className="sa-stat-value">{p.totalScore.toLocaleString()}</span>
              <Delta value={p.pointsThisWeek} suffix="this week" />
            </div>
          </div>
        </div>
        <div className="sa-stat">
          <span className="sa-stat-icon is-green">
            <IconCheck className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="sa-stat-label">Quizzes completed</p>
            <div className="flex flex-wrap items-baseline gap-x-2.5">
              <span className="sa-stat-value">{p.completedInProgram}</span>
              <Delta value={p.completedThisWeek} suffix="this week" />
            </div>
          </div>
        </div>
        <div className="sa-stat">
          <span className="sa-stat-icon is-violet">
            <IconTrophy className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="sa-stat-label">Current rank</p>
            <div className="flex flex-wrap items-baseline gap-x-2.5">
              <span className="sa-stat-value">{p.rank > 0 ? `#${p.rank}` : "-"}</span>
              {p.rank > 0 && <span className="text-xs font-semibold text-rahoot-muted">of {p.rankedCount}</span>}
            </div>
          </div>
        </div>
      </section>

      {p.ungroupedSubjects.length > 0 && (
        <div className="sa-panel flex flex-col gap-2 border-l-4 !border-l-[var(--skillarena-accent)] p-4">
          <p className="text-sm font-bold">Waiting on a group assignment</p>
          {p.ungroupedSubjects.map((sg) => (
            <p key={sg.id} className="text-sm text-rahoot-muted">
              <span className="font-semibold text-rahoot-ink">{sg.subjectName}</span> - you&apos;re assigned to this
              subject, but no group has been set for you yet, so its quizzes aren&apos;t available. Ask your
              instructor to assign your group.
            </p>
          ))}
        </div>
      )}

      {/* ---------------- Schedule + quizzes | news ---------------- */}
      <div className="sa-dash-grid">
        <div className="flex min-w-0 flex-col gap-5">
          <ClassSchedule entries={p.schedule} view={p.scheduleView} hasAny={p.hasAnySchedule} />

          {p.inProgress.length > 0 && (
            <section>
              <h2 className="sa-section-title">
                <IconClock className="h-5 w-5 text-[var(--skillarena-accent)]" />
                Continue where you left off
              </h2>
              <ul className="sa-quiz-grid">
                {p.inProgress.map((a) => (
                  <li key={a.id} className="sa-quiz-card is-progress">
                    <span className="badge badge-progress self-start">In progress</span>
                    <p className="mt-3 text-lg font-bold leading-snug">{a.title}</p>
                    <p className="mt-1 text-sm text-rahoot-muted">The question timer keeps running - finish soon.</p>
                    <Link href={`/quiz/${a.homeworkId}`} className="sa-card-btn mt-auto">
                      Resume <IconArrowRight className="h-4 w-4" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="sa-section-title">
              <IconBolt className="h-5 w-5 text-[#f5b82e]" />
              Available quizzes
            </h2>
            {p.available.length === 0 ? (
              <div className="sa-panel flex flex-col items-center gap-2 p-10 text-center">
                <span className="text-4xl">💪😈</span>
                <p className="mt-2 text-lg font-bold">ქვიზები მალე დაემატება</p>
                <p className="text-sm text-rahoot-muted">
                  You&apos;ve completed everything available right now - check back after the next lecture.
                </p>
              </div>
            ) : (
              <>
                <QuizCards quizzes={quizPreview} />
                {quizRest.length > 0 && (
                  <details className="sa-more">
                    <summary>
                      Show {quizRest.length} more quiz{quizRest.length === 1 ? "" : "zes"}
                      <IconChevronDown className="h-4 w-4" />
                    </summary>
                    <div className="mt-4">
                      <QuizCards quizzes={quizRest} />
                    </div>
                  </details>
                )}
              </>
            )}
          </section>
        </div>

        <CoolNews items={p.news} intervalMs={p.newsIntervalMs} />
      </div>

      {/* ---------------- Completed | activity + standings ---------------- */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0">
          <h2 className="sa-section-title">
            <IconCheck className="h-5 w-5 text-[var(--badge-success-text)]" />
            Completed quizzes
          </h2>
          {p.completed.length === 0 ? (
            <p className="text-sm text-rahoot-muted">No completed quizzes yet.</p>
          ) : (
            <ul className="sa-panel divide-y divide-[var(--rahoot-border)] overflow-hidden">
              {p.completed.map((a) => (
                <li key={a.id} className="flex items-center gap-4 px-4 py-3.5">
                  <span className={`sa-activity-icon ${a.failed ? "is-red" : "is-green"}`}>
                    {a.failed ? <IconX className="h-4 w-4" /> : <IconCheck className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{a.title}</p>
                    <p className="text-xs text-rahoot-muted">
                      {a.failed ? "Failed" : "Completed"} &middot; {a.score} / {a.totalQuestions}
                    </p>
                  </div>
                  <Link href={`/quiz/${a.homeworkId}/result`} className="sa-ghost-btn">
                    Review
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------------- Side column ---------------- */}
        <aside className="flex min-w-0 flex-col gap-6">
          <section className="sa-panel p-5">
            <h2 className="sa-section-title !mb-4">
              <IconClock className="h-5 w-5 text-rahoot-red" />
              Recent activity
            </h2>
            {p.activity.length === 0 ? (
              <p className="text-sm text-rahoot-muted">Finish a quiz and it will show up here.</p>
            ) : (
              <ul className="flex flex-col gap-4">
                {p.activity.map((a) => (
                  <li key={a.id} className="flex items-start gap-3">
                    <span className={`sa-activity-icon ${a.failed ? "is-red" : "is-gold"}`}>
                      {a.failed ? <IconX className="h-4 w-4" /> : <IconTrophy className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{a.failed ? "Quiz failed" : "Completed a quiz"}</p>
                      <p className="truncate text-xs text-rahoot-red">{a.title}</p>
                      <p
                        className={`mt-0.5 text-xs font-bold ${
                          a.points > 0 ? "text-[var(--badge-success-text)]" : "text-rahoot-muted"
                        }`}
                      >
                        +{a.points} points
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-rahoot-muted">{a.ago}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="sa-panel p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="sa-section-title !mb-0">
                <IconTrophy className="h-5 w-5 text-[var(--skillarena-accent)]" />
                Top of the class
              </h2>
              <Link href="/dashboard/leaderboard" className="sa-link-arrow" aria-label="Open leaderboard">
                <IconArrowRight className="h-4 w-4" />
              </Link>
            </div>
            {p.standings.length === 0 ? (
              <p className="text-sm text-rahoot-muted">No one has finished a quiz yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {p.standings.map((s) => (
                  <li
                    key={s.studentId}
                    className={`sa-mini-row ${s.studentId === p.studentId ? "is-you" : ""}`}
                  >
                    <span className="w-5 text-center text-xs font-black text-rahoot-muted">{s.rank}</span>
                    <Avatar seed={s.studentId} firstName={s.firstName} lastName={s.lastName} size={30} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {s.firstName} {s.lastName}
                      {s.studentId === p.studentId && <span className="ml-1 text-rahoot-red">(you)</span>}
                    </span>
                    <span className="text-sm font-black tabular-nums">{s.totalScore.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function QuizCards({ quizzes }: { quizzes: DashboardQuiz[] }) {
  return (
    <ul className="sa-quiz-grid sa-dash-quizzes">
      {quizzes.map((q) => {
        const label = q.subjectName ?? q.title;
        const hue = tileHue(label);
        return (
          <li key={q.id} className="sa-quiz-card">
            <span className="sa-quiz-tile" style={{ "--tile-hue": hue } as React.CSSProperties} aria-hidden>
              {tileLabel(label)}
            </span>
            <p className="mt-4 break-words text-base font-bold leading-snug">{q.title}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              {q.subjectName ? <span className="badge badge-available">{q.subjectName}</span> : <span />}
              <span className="ml-auto text-xs font-semibold text-rahoot-muted">
                {q.questionCount} question{q.questionCount === 1 ? "" : "s"}
              </span>
            </div>
            <Link href={`/quiz/${q.id}`} className="sa-card-btn mt-auto">
              Start <IconArrowRight className="h-4 w-4" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
