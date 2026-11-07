import { redirect } from "next/navigation";
import { getCurrentStudent } from "@/lib/session";
import { getCumulativeLeaderboard } from "@/lib/quiz";
import { CumulativeLeaderboard } from "@/components/CumulativeLeaderboard";

export default async function StudentLeaderboardPage() {
  const student = await getCurrentStudent();
  if (!student) redirect("/login");
  if (!student.programId) redirect("/dashboard");

  const entries = await getCumulativeLeaderboard(student.programId);
  const rank = entries.findIndex((e) => e.studentId === student.id) + 1;
  const total = entries.find((e) => e.studentId === student.id)?.totalScore ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-bold">🏆 Global Leaderboard</h1>
      <p className="mt-1 text-sm text-rahoot-muted">
        Cumulative score across every subject, every group, and every quiz you and your classmates have completed.
      </p>

      {rank > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:w-fit">
          <div className="stat-tile">
            <div className="stat-tile-label">Your rank</div>
            <div className="stat-tile-value">#{rank}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-label">Your total</div>
            <div className="stat-tile-value is-accent">{total}</div>
          </div>
        </div>
      )}

      <div className="mt-6">
        <CumulativeLeaderboard entries={entries} currentStudentId={student.id} />
      </div>
    </div>
  );
}
