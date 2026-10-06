import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/session";
import { loadHootGameForAdmin } from "@/lib/hootarena/access";
import { prisma } from "@/lib/prisma";
import { updateHootQuestion } from "../../../../actions";
import { HootQuestionForm } from "../../../../HootQuestionForm";

export default async function EditHootQuestionPage({
  params,
  searchParams,
}: PageProps<"/admin/hootarena/[id]/questions/[qid]/edit">) {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const { id, qid } = await params;
  const search = await searchParams;
  const error = typeof search?.error === "string" ? search.error : null;

  const game = await loadHootGameForAdmin(admin, id);
  if (!game) notFound();
  if (game.status !== "LOBBY") redirect(`/admin/hootarena/${id}`);

  const question = await prisma.hootQuestion.findFirst({
    where: { id: qid, gameId: game.id },
    include: { options: { orderBy: { order: "asc" } } },
  });
  if (!question) notFound();

  const updateQuestion = updateHootQuestion.bind(null, game.id, question.id);
  const correctIndices = question.options.map((o, i) => (o.isCorrect ? i + 1 : null)).filter((i): i is number => i !== null);

  return (
    <div className="mx-auto max-w-lg">
      <Link href={`/admin/hootarena/${game.id}`} className="text-sm text-rahoot-red hover:underline">
        &larr; Back to {game.title}
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold">Edit question</h1>
      <HootQuestionForm
        action={updateQuestion}
        error={error}
        submitLabel="Save question"
        defaults={{
          type: question.type,
          text: question.text,
          options: question.options.map((o) => o.text),
          correctIndices,
        }}
      />
    </div>
  );
}
