import type { CumulativeLeaderboardEntry } from "@/lib/quiz";

const MEDALS = ["🥇", "🥈", "🥉"];

// On a wide screen the top three are arranged as an actual podium - 2nd, 1st,
// 3rd - with the winner raised and the three blocks aligned along their base.
// On a phone that arrangement reads as "the list is out of order", so the
// reordering is applied only from `sm` up and the column stays 1-2-3.
const PODIUM_ORDER = ["sm:order-2", "sm:order-1", "sm:order-3"];
const PODIUM_HEIGHT = ["sm:pt-9 sm:pb-7", "sm:pt-6 sm:pb-5", "sm:pt-4 sm:pb-4"];

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
    <div className="flex flex-col gap-8">
      {top3.length > 0 && (
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
          {top3.map((e, i) => (
            <div
              key={e.studentId}
              className={`podium-step ${PODIUM_ORDER[i]} ${PODIUM_HEIGHT[i]} ${i === 0 ? "is-first" : ""} ${
                e.studentId === currentStudentId ? "is-you" : ""
              }`}
            >
              <span className="podium-rank">{i + 1}</span>
              <span className="text-3xl leading-none">{MEDALS[i]}</span>
              <span className="mt-2 font-bold">
                {e.firstName} {e.lastName}
              </span>
              <span className="podium-score">{e.totalScore.toLocaleString()}</span>
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
              className={`ladder-row ${e.studentId === currentStudentId ? "is-you" : ""}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="ladder-rank">{i + 4}</span>
                <span className="truncate font-semibold">
                  {e.firstName} {e.lastName}
                </span>
              </div>
              <span className="ladder-score">{e.totalScore.toLocaleString()}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
