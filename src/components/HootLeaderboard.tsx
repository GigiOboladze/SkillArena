import type { HootLeaderboardEntry, HootPublicLeaderboardEntry } from "@/lib/hootarena/socket-events";

const MEDALS = ["🥇", "🥈", "🥉"];

/** Full ranked board - used by the host (who always sees everyone) and by a player's own final results view. */
export function HootLeaderboard({ entries, highlightUserId }: { entries: HootLeaderboardEntry[]; highlightUserId?: string }) {
  if (entries.length === 0) {
    return <p className="text-sm text-rahoot-muted">No players have joined yet.</p>;
  }

  return (
    <ol className="flex flex-col gap-2">
      {entries.map((e, i) => (
        <li
          key={e.userId}
          className={`card flex items-center justify-between gap-3 p-4 ${e.userId === highlightUserId ? "border-rahoot-red" : ""}`}
        >
          <div className="flex items-center gap-3">
            <span className="w-8 text-center text-lg font-black text-rahoot-red">{MEDALS[i] ?? i + 1}</span>
            <span className="font-semibold">{e.username}</span>
          </div>
          <span className="text-xl font-black">{e.score.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Top-3 only - what a student ever sees, whether mid-game (between
 * questions) or at the final results screen. Deliberately typed against
 * HootPublicLeaderboardEntry (username + score only) - a student's client
 * never receives another player's internal database id in the first place,
 * so there's nothing to key on but the (unique) username.
 */
export function HootTop3({ top3 }: { top3: HootPublicLeaderboardEntry[] }) {
  if (top3.length === 0) {
    return <p className="text-sm text-rahoot-muted">No one has scored yet.</p>;
  }

  return (
    <ol className="flex flex-col gap-2">
      {top3.map((e, i) => (
        <li key={e.username} className="card flex items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <span className="w-8 text-center text-lg font-black text-rahoot-red">{MEDALS[i]}</span>
            <span className="font-semibold">{e.username}</span>
          </div>
          <span className="text-xl font-black">{e.score.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  );
}
