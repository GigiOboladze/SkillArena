import type { ReactNode } from "react";
import Link from "next/link";
import { Avatar } from "@/components/student/Avatar";
import {
  IconArrowRight,
  IconBug,
  IconCheck,
  IconClock,
  IconGamepad,
  IconMessage,
  IconPlus,
  IconQuiz,
  IconTrophy,
  IconUsers,
  IconX,
} from "@/components/student/Icons";

/**
 * Presentational admin overview. Every query and every program-scoping
 * decision lives in `app/admin/(dashboard)/page.tsx`; this only lays it out.
 */

export type AdminAttemptRow = {
  id: string;
  homeworkId: string;
  studentName: string;
  quizTitle: string;
  score: number;
  totalQuestions: number;
  failed: boolean;
  ago: string;
};
export type AdminLiveRow = { id: string; title: string; joined: number; status: string };
export type AdminTopStudent = {
  studentId: string;
  firstName: string;
  lastName: string;
  totalScore: number;
};

export type AdminOverviewProps = {
  firstName: string;
  scopeLabel: string;
  isSuper: boolean;
  quizCount: number;
  publishedQuizCount: number;
  studentCount: number;
  attemptCount: number;
  attemptsThisWeek: number;
  recentAttempts: AdminAttemptRow[];
  liveSessions: AdminLiveRow[];
  topStudents: AdminTopStudent[];
  topStudentsProgram: string | null;
  openBugReports: number;
  newInco: number;
};

const QUICK_ACTIONS = [
  { href: "/admin/quizzes/new", label: "New quiz", icon: IconPlus },
  { href: "/admin/students", label: "Students", icon: IconUsers },
  { href: "/admin/hootarena", label: "HootArena", icon: IconGamepad },
  { href: "/homeworks/new", label: "Live session", icon: IconClock },
];

function StatCard({
  label,
  value,
  icon,
  tone,
  delta,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  tone: "gold" | "green" | "violet" | "blue";
  delta?: number;
}) {
  return (
    <div className="sa-stat">
      <span className={`sa-stat-icon is-${tone}`}>{icon}</span>
      <div className="min-w-0">
        <p className="sa-stat-label">{label}</p>
        <div className="flex flex-wrap items-baseline gap-x-2.5">
          <span className="sa-stat-value">{value.toLocaleString()}</span>
          {delta ? <span className="sa-delta">+{delta} this week</span> : null}
        </div>
      </div>
    </div>
  );
}

export function AdminOverviewView(p: AdminOverviewProps) {
  return (
    <div className="flex flex-col gap-6">
      {/* ---------------- Hero ---------------- */}
      <section className="sa-hero">
        <div className="relative z-10 flex flex-col justify-center gap-3 p-7 sm:p-9">
          <span className="sa-area-tag self-start">{p.isSuper ? "Super Admin" : "Admin"}</span>
          <h1 className="text-3xl font-black leading-tight tracking-tight sm:text-4xl">
            Welcome back, {p.firstName}! <span aria-hidden>👋</span>
          </h1>
          <p className="text-base font-medium text-rahoot-muted">{p.scopeLabel}</p>
          <Link href="/admin/quizzes" className="sa-hero-cta group mt-3">
            <span>Manage your quizzes</span>
            <span className="sa-round-btn">
              <IconArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        </div>
        <div className="relative z-10 grid grid-cols-2 content-center gap-3 p-7 pt-0 sm:p-9 md:pl-0">
          {QUICK_ACTIONS.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="sa-quick-tile">
              <span className="sa-quick-icon">
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-sm font-bold">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------------- Stats ---------------- */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Totals">
        <StatCard label="Quizzes" value={p.quizCount} tone="violet" icon={<IconQuiz className="h-6 w-6" />} />
        <StatCard label="Published" value={p.publishedQuizCount} tone="green" icon={<IconCheck className="h-6 w-6" />} />
        <StatCard label="Students" value={p.studentCount} tone="blue" icon={<IconUsers className="h-6 w-6" />} />
        <StatCard
          label="Attempts"
          value={p.attemptCount}
          tone="gold"
          delta={p.attemptsThisWeek}
          icon={<IconTrophy className="h-6 w-6" />}
        />
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* ---------------- Recent attempts ---------------- */}
          <section>
            <h2 className="sa-section-title">
              <IconClock className="h-5 w-5 text-rahoot-red" />
              Latest quiz attempts
            </h2>
            {p.recentAttempts.length === 0 ? (
              <div className="sa-panel p-8 text-center text-sm text-rahoot-muted">
                No one has finished a quiz yet.
              </div>
            ) : (
              <ul className="sa-panel divide-y divide-[var(--sa-panel-border)] overflow-hidden">
                {p.recentAttempts.map((a) => (
                  <li key={a.id} className="flex items-center gap-4 px-4 py-3.5">
                    <span className={`sa-activity-icon ${a.failed ? "is-red" : "is-green"}`}>
                      {a.failed ? <IconX className="h-4 w-4" /> : <IconCheck className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{a.studentName}</p>
                      <p className="truncate text-xs text-rahoot-muted">
                        <span className="text-rahoot-red">{a.quizTitle}</span> &middot;{" "}
                        {a.failed ? "Failed" : `${a.score} / ${a.totalQuestions}`}
                      </p>
                    </div>
                    <span className="hidden shrink-0 text-xs text-rahoot-muted sm:inline">{a.ago}</span>
                    <Link href={`/admin/quizzes/${a.homeworkId}/results`} className="sa-ghost-btn">
                      Results
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ---------------- Live sessions (legacy) ---------------- */}
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="sa-section-title !mb-0">
                <IconGamepad className="h-5 w-5 text-[var(--skillarena-accent)]" />
                Live sessions
                <span className="text-xs font-semibold text-rahoot-muted">(legacy Kahoot-style hosting)</span>
              </h2>
              <Link href="/homeworks/new" className="sa-ghost-btn inline-flex items-center gap-1">
                <IconPlus className="h-3.5 w-3.5" /> New live session
              </Link>
            </div>
            {p.liveSessions.length === 0 ? (
              <p className="text-sm text-rahoot-muted">No live sessions yet.</p>
            ) : (
              <ul className="sa-panel divide-y divide-[var(--sa-panel-border)] overflow-hidden">
                {p.liveSessions.map((hw) => (
                  <li key={hw.id}>
                    <Link
                      href={`/homeworks/${hw.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3.5 text-sm transition-colors hover:bg-[var(--sa-inset)]"
                    >
                      <span className="truncate font-semibold">{hw.title}</span>
                      <span className="shrink-0 text-rahoot-muted">
                        {hw.joined} joined &middot; {hw.status}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ---------------- Side column ---------------- */}
        <aside className="flex min-w-0 flex-col gap-6">
          <section className="sa-panel p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="sa-section-title !mb-0">
                <IconTrophy className="h-5 w-5 text-[var(--skillarena-accent)]" />
                Top students
              </h2>
              <Link href="/admin/leaderboard" className="sa-link-arrow" aria-label="Open leaderboard">
                <IconArrowRight className="h-4 w-4" />
              </Link>
            </div>
            {p.topStudentsProgram && <p className="-mt-2 mb-3 text-xs text-rahoot-muted">{p.topStudentsProgram}</p>}
            {p.topStudents.length === 0 ? (
              <p className="text-sm text-rahoot-muted">No one has finished a quiz yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {p.topStudents.map((s, i) => (
                  <li key={s.studentId} className="sa-mini-row">
                    <span className={`w-5 text-center text-xs font-black ${i < 3 ? "text-[var(--skillarena-accent)]" : "text-rahoot-muted"}`}>
                      {i + 1}
                    </span>
                    <Avatar seed={s.studentId} firstName={s.firstName} lastName={s.lastName} size={30} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {s.firstName} {s.lastName}
                    </span>
                    <span className="text-sm font-black tabular-nums">{s.totalScore.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="sa-panel p-5">
            <h2 className="sa-section-title !mb-4">
              <IconBug className="h-5 w-5 text-[var(--badge-danger-text)]" />
              Needs attention
            </h2>
            <div className="flex flex-col gap-2">
              <Link href="/admin/bug-reports" className="sa-attention-row">
                <span className="sa-activity-icon is-red">
                  <IconBug className="h-4 w-4" />
                </span>
                <span className="flex-1 text-sm font-semibold">Open bug reports</span>
                <span className={`sa-attention-count ${p.openBugReports > 0 ? "is-hot" : ""}`}>{p.openBugReports}</span>
              </Link>
              {p.isSuper && (
                <Link href="/admin/inco" className="sa-attention-row">
                  <span className="sa-activity-icon is-gold">
                    <IconMessage className="h-4 w-4" />
                  </span>
                  <span className="flex-1 text-sm font-semibold">New INCO messages</span>
                  <span className={`sa-attention-count ${p.newInco > 0 ? "is-hot" : ""}`}>{p.newInco}</span>
                </Link>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
