import type { ReactNode } from "react";
import type { CumulativeLeaderboardEntry } from "@/lib/quiz";
import { Avatar } from "./Avatar";

/**
 * Leaderboard: a 3D podium for the top three (2nd - 1st - 3rd, the
 * winner's block tallest) and a ranked list underneath.
 *
 * Used by both the student leaderboard (pass `currentStudentId` to get the
 * "You" highlight, rank chips and "points to overtake" line) and the admin
 * leaderboard (no current student; `actions` holds the program selector).
 */

// Visual order on the podium is 2nd, 1st, 3rd.
const PODIUM_SLOTS = [
  { index: 1, place: 2, className: "is-second" },
  { index: 0, place: 1, className: "is-first" },
  { index: 2, place: 3, className: "is-third" },
];

export function LeaderboardView({
  entries,
  currentStudentId,
  description = "Cumulative score across every subject, every group, and every quiz you and your classmates have completed.",
  actions,
}: {
  entries: CumulativeLeaderboardEntry[];
  currentStudentId?: string;
  description?: string;
  actions?: ReactNode;
}) {
  const youIndex = entries.findIndex((e) => e.studentId === currentStudentId);
  const you = youIndex >= 0 ? entries[youIndex] : null;
  const leaderScore = entries[0]?.totalScore ?? 0;
  const toNext = youIndex > 0 ? entries[youIndex - 1].totalScore - entries[youIndex].totalScore : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Leaderboard</h1>
          <p className="mt-1 max-w-xl text-sm text-rahoot-muted">{description}</p>
        </div>
        {actions}
        {you && (
          <div className="flex gap-3">
            <div className="sa-chip">
              <span className="sa-chip-label">Your rank</span>
              <span className="sa-chip-value">#{youIndex + 1}</span>
            </div>
            <div className="sa-chip">
              <span className="sa-chip-label">Your points</span>
              <span className="sa-chip-value text-[var(--skillarena-accent)]">{you.totalScore.toLocaleString()}</span>
            </div>
          </div>
        )}
      </header>

      {entries.length === 0 ? (
        <div className="sa-panel p-10 text-center text-sm text-rahoot-muted">
          The leaderboard will come alive once students complete their first quiz.
        </div>
      ) : (
        <>
          {/* ---------------- Podium ---------------- */}
          <section className="sa-podium-stage" aria-label="Top three">
            <div className="sa-podium">
              {PODIUM_SLOTS.map((slot) => {
                const e = entries[slot.index];
                if (!e) return <div key={slot.place} className={`sa-podium-col ${slot.className} is-empty`} />;
                const isYou = e.studentId === currentStudentId;
                return (
                  <div key={slot.place} className={`sa-podium-col ${slot.className} ${isYou ? "is-you" : ""}`}>
                    <div className="sa-podium-person">
                      <span className="sa-podium-ring">
                        <Avatar
                          seed={e.studentId}
                          firstName={e.firstName}
                          lastName={e.lastName}
                          size={slot.place === 1 ? 88 : 72}
                        />
                      </span>
                      <span className="sa-podium-name">
                        {e.firstName} {e.lastName.charAt(0)}.
                      </span>
                      <span className="sa-podium-points">{e.totalScore.toLocaleString()} pts</span>
                    </div>
                    <div className="sa-podium-block">
                      <span className="sa-podium-top" aria-hidden />
                      <span className="sa-podium-num">{slot.place}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ---------------- Your position ---------------- */}
          {you && youIndex > 0 && toNext !== null && (
            <p className="text-center text-sm text-rahoot-muted">
              {toNext === 0 ? (
                <>You&apos;re tied with #{youIndex}. One more quiz could move you up.</>
              ) : (
                <>
                  <span className="font-bold text-rahoot-ink">{toNext.toLocaleString()}</span> point
                  {toNext === 1 ? "" : "s"} to overtake #{youIndex}
                  {youIndex > 1 && (
                    <>
                      {" "}
                      &middot; <span className="font-bold text-rahoot-ink">
                        {(leaderScore - you.totalScore).toLocaleString()}
                      </span>{" "}
                      behind the leader
                    </>
                  )}
                </>
              )}
            </p>
          )}

          {/* ---------------- Full ranking ---------------- */}
          <section className="sa-panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--rahoot-border)] px-5 py-4">
              <h2 className="text-base font-bold">All students</h2>
              <span className="text-xs font-semibold text-rahoot-muted">{entries.length} ranked</span>
            </div>
            <ol>
              {entries.map((e, i) => {
                const isYou = e.studentId === currentStudentId;
                return (
                  // Rows are kept lean (semantic classes, CSS-drawn icons, no inline
                  // gradients): a program can have hundreds of students, and every
                  // byte here is sent twice - in the HTML and in the RSC payload.
                  <li key={e.studentId} className={isYou ? "sa-rank-row is-you" : "sa-rank-row"}>
                    <span className={i < 3 ? "sa-rank-num is-top" : "sa-rank-num"}>{i + 1}</span>
                    <Avatar seed={e.studentId} firstName={e.firstName} lastName={e.lastName} size={46} />
                    <div className="sa-rank-body">
                      <p className="sa-rank-name">
                        {`${e.firstName} ${e.lastName}`}
                        {isYou && <span className="ml-1.5 text-xs font-bold text-rahoot-red">You</span>}
                      </p>
                      <p className="sa-rank-meta">
                        <i className="sa-ico sa-ico-check" />
                        {`${e.completedQuizzes} quiz${e.completedQuizzes === 1 ? "" : "zes"}`}
                      </p>
                    </div>
                    <span className="sa-score-pill">
                      <i className="sa-ico sa-ico-star" />
                      {e.totalScore.toLocaleString()}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
