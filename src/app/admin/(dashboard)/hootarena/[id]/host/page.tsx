import { notFound } from "next/navigation";
import { getStaffWith } from "@/lib/staff-guard";
import { loadHootGameForAdmin } from "@/lib/hootarena/access";
import { prisma } from "@/lib/prisma";
import { HootHostClient } from "./HootHostClient";

export default async function HootHostPage({ params }: PageProps<"/admin/hootarena/[id]/host">) {
  const admin = await getStaffWith("hoot.host");
  if (!admin) notFound();

  const { id } = await params;
  const game = await loadHootGameForAdmin(admin, id);
  if (!game) notFound();

  const totalQuestions = await prisma.hootQuestion.count({ where: { gameId: game.id } });

  return <HootHostClient gameId={game.id} title={game.title} pin={game.pin} totalQuestions={totalQuestions} />;
}
