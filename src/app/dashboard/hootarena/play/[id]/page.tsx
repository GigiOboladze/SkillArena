import { redirect } from "next/navigation";
import { getCurrentStudent } from "@/lib/session";
import { HootPlayClient } from "./HootPlayClient";

// Deliberately does not pre-check game existence/eligibility here - the
// `player:join` socket handler in server.ts is the real, always-enforced
// authorization boundary (re-validating program/group eligibility from the
// database regardless of how the student arrived at this URL), and it
// returns a friendly ack(false, message) the client already renders.
export default async function HootArenaPlayPage({ params }: PageProps<"/dashboard/hootarena/play/[id]">) {
  const student = await getCurrentStudent();
  if (!student) redirect("/login");

  const { id } = await params;
  return <HootPlayClient gameId={id} username={student.username} />;
}
