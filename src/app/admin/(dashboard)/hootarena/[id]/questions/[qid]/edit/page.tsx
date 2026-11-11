import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getStaffWith } from "@/lib/staff-guard";
import { loadHootGameForAdmin } from "@/lib/hootarena/access";
import { prisma } from "@/lib/prisma";
import { updateHootQuestion } from "../../../../actions";
import { HootQuestionForm } from "../../../../HootQuestionForm";
import { QuestionArt } from "@/components/admin/questions/QuestionArt";

export default async function EditHootQuestionPage({
  params,
  searchParams,
}: PageProps<"/admin/hootarena/[id]/questions/[qid]/edit">) {
  const admin = await getStaffWith("hoot.host");
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
    <section className="sa-qf sa-qf-hootpage">
      <QuestionArt className="sa-qf-hoot-art" />
      <header className="sa-qf-head">
        <div className="min-w-0">
          <Link href={`/admin/hootarena/${game.id}`} className="sa-mp-back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
              <path d="M19 12H5M11 6l-6 6 6 6" />
            </svg>
            Back to Game
          </Link>
          <div className="mt-3 flex items-center gap-4">
            <span className="sa-br-head-icon !h-16 !w-16" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
                <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
                <path d="m13.5 6.5 4 4" />
              </svg>
            </span>
            <div className="min-w-0">
              <h1 className="text-3xl font-black tracking-tight sm:text-[2.6rem] sm:leading-tight">Edit Question</h1>
              <p className="mt-0.5 text-rahoot-muted sm:text-[1.05rem]">Update this question and its answers.</p>
            </div>
          </div>
        </div>
      </header>
      <HootQuestionForm
        action={updateQuestion}
        error={error}
        submitLabel="Save Question"
        defaults={{
          type: question.type,
          text: question.text,
          options: question.options.map((o) => o.text),
          correctIndices,
        }}
      />
    </section>
  );
}
