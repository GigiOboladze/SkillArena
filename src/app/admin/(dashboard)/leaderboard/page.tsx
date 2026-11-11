import { notFound } from "next/navigation";
import { getStaffWith } from "@/lib/staff-guard";
import { getCumulativeLeaderboard } from "@/lib/quiz";
import { resolveAdminProgramScope, listPrograms } from "@/lib/programs";
import { LeaderboardView } from "@/components/student/LeaderboardView";
import { ProgramSelector } from "@/components/ProgramSelector";

export default async function AdminLeaderboardPage({
  searchParams,
}: PageProps<"/admin/leaderboard">) {
  const admin = await getStaffWith("leaderboard.view");
  if (!admin) notFound();

  const search = await searchParams;
  const requested = typeof search?.program === "string" ? search.program : undefined;
  const programId = await resolveAdminProgramScope(admin, requested);
  if (!programId) {
    return <p className="text-rahoot-muted">No programs exist yet.</p>;
  }

  const [entries, programs] = await Promise.all([
    getCumulativeLeaderboard(programId),
    admin.role === "SUPER_ADMIN" ? listPrograms() : Promise.resolve([]),
  ]);

  return (
    <LeaderboardView
      entries={entries}
      description="Cumulative score across every quiz a student has completed in this program."
      actions={
        admin.role === "SUPER_ADMIN" && programs.length > 1 ? (
          <div className="sa-chip !flex-row min-w-0 max-w-full items-center">
            <ProgramSelector programs={programs} currentProgramId={programId} basePath="/admin/leaderboard" />
          </div>
        ) : null
      }
    />
  );
}
