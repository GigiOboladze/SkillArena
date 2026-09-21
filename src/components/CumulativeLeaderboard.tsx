import type { CumulativeLeaderboardEntry } from "@/lib/quiz";

const MEDALS = ["🥇", "🥈", "🥉"];

export function CumulativeLeaderboard({
  entries,
  currentStudentId,
  emptyMessage = "The leaderboard will come alive once students complete their first quiz.",
}: {
  entries: CumulativeLeaderboardEntry[];
  currentStudentId?: string;
  emptyMessage?: string;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-rahoot-muted">{emptyMessage}</p>;
  }

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <div className="flex flex-col gap-6">
      {top3.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {top3.map((e, i) => (
            <div
              key={e.studentId}
              className={`card flex flex-col items-center p-5 text-center ${
                e.studentId === currentStudentId ? "border-rahoot-red" : ""
              } ${i === 0 ? "sm:-translate-y-2 shadow-[0_0_32px_var(--skillarena-accent-light)]" : ""}`}
            >
              <span className="text-3xl">{MEDALS[i]}</span>
              <span className="mt-2 font-bold">
                {e.firstName} {e.lastName}
              </span>
              <span className="mt-1 text-2xl font-black text-skillarena-accent">{e.totalScore}</span>
              <span className="text-xs text-rahoot-muted">points</span>
            </div>
          ))}
        </div>
      )}

      {rest.length > 0 && (
        <ol className="flex flex-col gap-2" start={4}>
          {rest.map((e, i) => (
            <li
              key={e.studentId}
              className={`card flex items-center justify-between gap-3 p-4 ${
                e.studentId === currentStudentId ? "border-rahoot-red" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="w-8 text-center text-sm font-bold text-rahoot-muted">#{i + 4}</span>
                <span className="font-semibold">
                  {e.firstName} {e.lastName}
                </span>
              </div>
              <span className="text-lg font-black">{e.totalScore.toLocaleString()}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
