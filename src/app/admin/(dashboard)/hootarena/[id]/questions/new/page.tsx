import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/session";
import { loadHootGameForAdmin } from "@/lib/hootarena/access";
import { createHootQuestion } from "../../../actions";
import { HootQuestionForm } from "../../../HootQuestionForm";

export default async function NewHootQuestionPage({
  params,
  searchParams,
}: PageProps<"/admin/hootarena/[id]/questions/new">) {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const { id } = await params;
  const search = await searchParams;
  const error = typeof search?.error === "string" ? search.error : null;

  const game = await loadHootGameForAdmin(admin, id);
  if (!game) notFound();
  if (game.status !== "LOBBY") redirect(`/admin/hootarena/${id}`);

  const createQuestion = createHootQuestion.bind(null, game.id);

  return (
    <div className="mx-auto max-w-lg">
      <Link href={`/admin/hootarena/${game.id}`} className="text-sm text-rahoot-red hover:underline">
        &larr; Back to {game.title}
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold">Add question</h1>
      <HootQuestionForm action={createQuestion} error={error} submitLabel="Add question" />
    </div>
  );
}
