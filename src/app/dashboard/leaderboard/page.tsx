import { redirect } from "next/navigation";
import { getCurrentStudent } from "@/lib/session";
import { getCumulativeLeaderboard } from "@/lib/quiz";
import { LeaderboardView } from "@/components/student/LeaderboardView";

export default async function StudentLeaderboardPage() {
  const student = await getCurrentStudent();
  if (!student) redirect("/login");
  if (!student.programId) redirect("/dashboard");

  const entries = await getCumulativeLeaderboard(student.programId);

  return <LeaderboardView entries={entries} currentStudentId={student.id} />;
}
