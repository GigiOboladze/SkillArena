import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getStaffWith } from "@/lib/staff-guard";
import { loadHootGameForAdmin } from "@/lib/hootarena/access";
import { createHootQuestion } from "../../../actions";
import { HootQuestionForm } from "../../../HootQuestionForm";
import { QuestionArt } from "@/components/admin/questions/QuestionArt";

export default async function NewHootQuestionPage({
  params,
  searchParams,
}: PageProps<"/admin/hootarena/[id]/questions/new">) {
  const admin = await getStaffWith("hoot.host");
  if (!admin) notFound();

  const { id } = await params;
  const search = await searchParams;
  const error = typeof search?.error === "string" ? search.error : null;

  const game = await loadHootGameForAdmin(admin, id);
  if (!game) notFound();
  if (game.status !== "LOBBY") redirect(`/admin/hootarena/${id}`);

  const createQuestion = createHootQuestion.bind(null, game.id);

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
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" className="h-8 w-8">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <div className="min-w-0">
              <h1 className="text-3xl font-black tracking-tight sm:text-[2.6rem] sm:leading-tight">Add Question</h1>
              <p className="mt-0.5 text-rahoot-muted sm:text-[1.05rem]">Create a new question for your HootArena game.</p>
            </div>
          </div>
        </div>
      </header>
      <HootQuestionForm action={createQuestion} error={error} submitLabel="Add Question" />
    </section>
  );
}
