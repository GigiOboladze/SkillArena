import { notFound } from "next/navigation";
import { getCurrentAdmin } from "@/lib/session";
import { getCumulativeLeaderboard } from "@/lib/quiz";
import { resolveAdminProgramScope, listPrograms } from "@/lib/programs";
import { CumulativeLeaderboard } from "@/components/CumulativeLeaderboard";
import { ProgramSelector } from "@/components/ProgramSelector";

export default async function AdminLeaderboardPage({
  searchParams,
}: PageProps<"/admin/leaderboard">) {
  const admin = await getCurrentAdmin();
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
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Leaderboard</h1>
          <p className="mt-1 text-sm text-rahoot-muted">
            Cumulative score across every quiz a student has completed in this program.
          </p>
        </div>
        {admin.role === "SUPER_ADMIN" && (
          <ProgramSelector programs={programs} currentProgramId={programId} basePath="/admin/leaderboard" />
        )}
      </div>
      <div className="mt-6">
        <CumulativeLeaderboard entries={entries} />
      </div>
    </div>
  );
}
