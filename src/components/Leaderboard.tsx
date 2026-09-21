import type { LeaderboardEntry } from "@/lib/scoring";

const MEDALS = ["🥇", "🥈", "🥉"];

export function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-rahoot-muted">No students have joined yet.</p>;
  }

  return (
    <ol className="flex flex-col gap-2">
      {entries.map((e, i) => (
        <li
          key={e.studentId}
          className="card flex items-center justify-between gap-3 p-4"
        >
          <div className="flex items-center gap-3">
            <span className="w-8 text-center text-lg font-black text-rahoot-red">
              {MEDALS[i] ?? i + 1}
            </span>
            <span className="font-semibold">
              {e.firstName} {e.lastName}
            </span>
            {e.pendingGrading > 0 && (
              <span className="badge badge-neutral">
                {e.pendingGrading} pending grading
              </span>
            )}
          </div>
          <span className="text-xl font-black">{e.totalScore.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  );
}
