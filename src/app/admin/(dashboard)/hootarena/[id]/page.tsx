import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentAdmin } from "@/lib/session";
import { loadHootGameForAdmin } from "@/lib/hootarena/access";
import { prisma } from "@/lib/prisma";
import {
  updateHootGameDetails,
  updateHootGameTargeting,
  deleteHootGame,
  deleteHootQuestion,
  moveHootQuestion,
} from "../actions";
import { DeleteHootGameButton } from "../DeleteHootGameButton";
import { HootTargetingForm } from "./HootTargetingForm";
import { listSubjectsWithGroups } from "@/lib/subjects";

const TYPE_LABELS: Record<string, string> = {
  SINGLE_CHOICE: "Single Choice",
  MULTIPLE_CHOICE: "Multiple Choice",
  TRUE_FALSE: "True / False",
};

const ERROR_MESSAGES: Record<string, string> = {
  title: "Please enter a title.",
  subject: "Please choose a subject.",
};

export default async function ManageHootGamePage({
  params,
  searchParams,
}: PageProps<"/admin/hootarena/[id]">) {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const { id } = await params;
  const search = await searchParams;
  const error = typeof search?.error === "string" ? ERROR_MESSAGES[search.error] ?? null : null;

  const game = await loadHootGameForAdmin(admin, id);
  if (!game) notFound();

  const [questions, subjects] = await Promise.all([
    prisma.hootQuestion.findMany({
      where: { gameId: game.id },
      orderBy: { order: "asc" },
      include: { options: { orderBy: { order: "asc" } } },
    }),
    listSubjectsWithGroups(game.subject.programId),
  ]);
  const targetGroups = await prisma.hootTargetGroup.findMany({ where: { gameId: game.id } });

  const editable = game.status === "LOBBY";
  const updateDetails = updateHootGameDetails.bind(null, game.id);
  const updateTargeting = updateHootGameTargeting.bind(null, game.id);
  const removeGame = deleteHootGame.bind(null, game.id);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{game.title}</h1>
            {!editable && <span className="badge badge-success">Live</span>}
          </div>
          <p className="mt-1 text-sm text-rahoot-muted">
            {questions.length} question{questions.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="badge bg-rahoot-red-light text-rahoot-red-dark text-base">Game PIN: {game.pin}</span>
          <Link href={`/admin/hootarena/${game.id}/host`} className="btn btn-primary">
            {editable ? "Open lobby" : "Open host controls"}
          </Link>
        </div>
      </div>

      {!editable && (
        <p className="text-sm text-rahoot-muted">
          This game has started - questions and target groups are locked in. Manage it live from{" "}
          <Link href={`/admin/hootarena/${game.id}/host`} className="text-rahoot-red hover:underline">
            host controls
          </Link>
          .
        </p>
      )}

      {editable && (
        <section className="card p-6">
          <h2 className="font-bold">Subject &amp; target groups</h2>
          <p className="mt-1 text-sm text-rahoot-muted">
            Only students whose group (for this subject) is checked below will be able to join this game.
          </p>
          <div className="mt-4">
            <HootTargetingForm
              action={updateTargeting}
              subjects={subjects}
              currentSubjectId={game.subjectId}
              currentGroupIds={targetGroups.map((g) => g.groupId)}
            />
          </div>
        </section>
      )}

      {editable && (
        <section className="card p-6">
          <h2 className="font-bold">Details</h2>
          <form action={updateDetails} className="mt-4 flex flex-col gap-3">
            <label className="text-sm font-semibold">
              Title
              <input name="title" required maxLength={120} defaultValue={game.title} className="input mt-1" />
            </label>
            {error && <p className="text-sm font-medium text-rahoot-red">{error}</p>}
            <button type="submit" className="btn btn-outline self-start">
              Save details
            </button>
          </form>
        </section>
      )}

      <section className="card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">
            Questions <span className="font-normal text-rahoot-muted">({questions.length})</span>
          </h2>
          {editable && (
            <Link href={`/admin/hootarena/${game.id}/questions/new`} className="btn btn-primary">
              + Add question
            </Link>
          )}
        </div>

        {questions.length === 0 ? (
          <p className="mt-4 text-sm text-rahoot-muted">No questions yet.</p>
        ) : (
          <ol className="mt-4 flex flex-col gap-2">
            {questions.map((q, i) => {
              const removeQuestion = deleteHootQuestion.bind(null, game.id, q.id);
              const moveUp = moveHootQuestion.bind(null, game.id, q.id, "up");
              const moveDown = moveHootQuestion.bind(null, game.id, q.id, "down");
              const correctText = q.options.filter((o) => o.isCorrect).map((o) => o.text).join(", ");
              return (
                <li key={q.id} className="flex items-center justify-between gap-3 rounded-lg border border-rahoot-border p-3">
                  {editable && (
                    <div className="flex items-center gap-1">
                      <form action={moveUp}>
                        <button
                          type="submit"
                          disabled={i === 0}
                          title="Move up"
                          className="rounded px-2 py-1 text-rahoot-muted hover:text-rahoot-red disabled:opacity-30"
                        >
                          &uarr;
                        </button>
                      </form>
                      <form action={moveDown}>
                        <button
                          type="submit"
                          disabled={i === questions.length - 1}
                          title="Move down"
                          className="rounded px-2 py-1 text-rahoot-muted hover:text-rahoot-red disabled:opacity-30"
                        >
                          &darr;
                        </button>
                      </form>
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="font-semibold">
                      {i + 1}. {q.text} <span className="badge badge-neutral align-middle text-xs">{TYPE_LABELS[q.type]}</span>
                    </p>
                    <p className="text-xs text-rahoot-muted">Correct: {correctText || "-"}</p>
                  </div>
                  {editable && (
                    <div className="flex shrink-0 gap-2">
                      <Link
                        href={`/admin/hootarena/${game.id}/questions/${q.id}/edit`}
                        className="btn btn-outline !py-1.5 !px-3 text-sm"
                      >
                        Edit
                      </Link>
                      <form action={removeQuestion}>
                        <button type="submit" className="btn btn-outline !py-1.5 !px-3 text-sm">
                          Delete
                        </button>
                      </form>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {editable && (
        <form action={removeGame} className="self-start">
          <DeleteHootGameButton title={game.title} />
        </form>
      )}
    </div>
  );
}
