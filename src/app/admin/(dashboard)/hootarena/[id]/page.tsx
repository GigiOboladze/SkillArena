import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getStaffWith } from "@/lib/staff-guard";
import { loadHootGameForAdmin } from "@/lib/hootarena/access";
import { prisma } from "@/lib/prisma";
import { generateHootJoinQrDataUrl, hootJoinUrlForPin } from "@/lib/qr";
import { updateHootGameDetails, deleteHootGame, deleteHootQuestion, moveHootQuestion } from "../actions";
import { DeleteHootGameButton } from "../DeleteHootGameButton";
import { CopyTextButton } from "@/components/admin/CopyTextButton";

const TYPE_LABELS: Record<string, string> = {
  SINGLE_CHOICE: "Single Choice",
  MULTIPLE_CHOICE: "Multiple Choice",
  TRUE_FALSE: "True / False",
};

const ERROR_MESSAGES: Record<string, string> = {
  title: "Please enter a title.",
};

const svg = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

function IconGamepad({ className }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M7 7h10a4.5 4.5 0 0 1 4.4 5.5l-1 4.3a2.4 2.4 0 0 1-4.1 1.1L14 15.5h-4l-2.3 2.4a2.4 2.4 0 0 1-4.1-1.1l-1-4.3A4.5 4.5 0 0 1 7 7Z" />
      <path d="M8 10v3M6.5 11.5h3M15.5 11h.01M17.5 12.5h.01" />
    </svg>
  );
}
function IconPencil({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}

/** Decorative neon gamepad + checkered flag for the join card. */
function JoinArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 260 220" className={className} aria-hidden>
      <defs>
        <linearGradient id="hg-pad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b6bff" stopOpacity=".55" />
          <stop offset="1" stopColor="#4c2bd0" stopOpacity=".35" />
        </linearGradient>
        <pattern id="hg-check" width="12" height="12" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#e9e3ff" />
          <rect x="6" y="6" width="6" height="6" fill="#e9e3ff" />
          <rect x="6" width="6" height="6" fill="#6d4aff" />
          <rect y="6" width="6" height="6" fill="#6d4aff" />
        </pattern>
        <filter id="hg-neon" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g transform="rotate(16 200 50)">
        <path d="M188 18v84" stroke="#c4b5fd" strokeWidth="4" strokeLinecap="round" />
        <path d="M190 18c18-6 30 6 52 0v38c-22 6-34-6-52 0Z" fill="url(#hg-check)" />
      </g>
      <g filter="url(#hg-neon)" transform="rotate(-14 120 140)">
        <path d="M58 92h124a40 40 0 0 1 39 49l-10 42a24 24 0 0 1-41 11l-22-24h-56l-22 24a24 24 0 0 1-41-11l-10-42a40 40 0 0 1 39-49Z" fill="url(#hg-pad)" stroke="#b79bff" strokeWidth="3" />
        <path d="M72 124v34M55 141h34" stroke="#d8ccff" strokeWidth="6" strokeLinecap="round" />
        <circle cx="168" cy="128" r="7" fill="none" stroke="#d8ccff" strokeWidth="3" />
        <circle cx="186" cy="146" r="7" fill="none" stroke="#d8ccff" strokeWidth="3" />
        <circle cx="96" cy="170" r="12" fill="none" stroke="#b79bff" strokeWidth="3" />
        <circle cx="146" cy="170" r="12" fill="none" stroke="#b79bff" strokeWidth="3" />
      </g>
    </svg>
  );
}

export default async function ManageHootGamePage({ params, searchParams }: PageProps<"/admin/hootarena/[id]">) {
  const admin = await getStaffWith("hoot.host");
  if (!admin) notFound();

  const { id } = await params;
  const search = await searchParams;
  const error = typeof search?.error === "string" ? ERROR_MESSAGES[search.error] ?? null : null;

  const game = await loadHootGameForAdmin(admin, id);
  if (!game) notFound();

  const questions = await prisma.hootQuestion.findMany({
    where: { gameId: game.id },
    orderBy: { order: "asc" },
    include: { options: { orderBy: { order: "asc" } } },
  });

  const editable = game.status === "LOBBY";
  // A finished game is no longer listed on /admin/hootarena, but its page is
  // still reachable (e.g. from the host screen's back link or browser
  // history) - it must not claim to be live or invite more players.
  const finished = game.status === "FINISHED";
  const updateDetails = updateHootGameDetails.bind(null, game.id);
  const removeGame = deleteHootGame.bind(null, game.id);
  const qrDataUrl = await generateHootJoinQrDataUrl(game.pin);
  const joinUrl = hootJoinUrlForPin(game.pin);
  const created = game.createdAt
    .toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tbilisi" })
    .replace(",", ",");
  const primaryLabel = editable ? "Open Lobby" : finished ? "View final results" : "Open host controls";

  return (
    <div className="sa-hg flex flex-col gap-6">
      {/* ---------------- Top bar ---------------- */}
      <header className="sa-hg-top">
        <Link href="/admin/hootarena" className="sa-hg-back" aria-label="Back to HootArena games">
          <svg {...svg} strokeWidth={2.2} className="h-6 w-6">
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
        </Link>
        <span className="sa-br-head-icon !h-16 !w-16" aria-hidden>
          <IconGamepad className="h-8 w-8" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="truncate text-3xl font-black tracking-tight sm:text-4xl">{game.title}</h1>
            {editable && (
              <details className="sa-pop" open={error ? true : undefined}>
                <summary className="sa-hg-pencil" aria-label="Edit title">
                  <IconPencil />
                </summary>
                <form action={updateDetails} className="sa-pop-panel sa-mp-pop">
                  <label className="sa-mp-field">
                    <span>Title</span>
                    <input name="title" required maxLength={120} defaultValue={game.title} className="sa-mp-input" />
                  </label>
                  {error && <p className="text-sm font-medium text-rahoot-red">{error}</p>}
                  <button type="submit" className="sa-qd-primary justify-center">
                    Save details
                  </button>
                </form>
              </details>
            )}
            {!editable && <span className={`sa-ha-status ${finished ? "" : "is-live"}`}>{finished ? "Finished" : "Live"}</span>}
          </div>
          <p className="mt-1 text-rahoot-muted">
            {questions.length} Question{questions.length === 1 ? "" : "s"} &bull; Created {created}
          </p>
        </div>
        <div className="sa-hg-top-actions">
          <Link href={`/admin/hootarena/${game.id}/host`} className="sa-br-primary">
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
              <path d="M7 4.5v15l12.5-7.5Z" fill="currentColor" />
            </svg>
            {primaryLabel}
          </Link>
          {editable && (
            <details className="sa-menu">
              <summary aria-label="More actions" className="!h-12 !w-12 !rounded-2xl">
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
                  <circle cx="12" cy="5.5" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="12" cy="18.5" r="1.8" />
                </svg>
              </summary>
              <div className="sa-menu-panel !min-w-[16rem]">
                <form action={removeGame}>
                  <DeleteHootGameButton title={game.title} className="is-danger" />
                </form>
              </div>
            </details>
          )}
        </div>
      </header>

      {finished && (
        <p className="text-sm text-rahoot-muted">
          This game is over - its questions and final results are kept here for reference. Create a new game to play again.
        </p>
      )}
      {!editable && !finished && (
        <p className="text-sm text-rahoot-muted">
          This game has started - questions are locked in. Manage it live from{" "}
          <Link href={`/admin/hootarena/${game.id}/host`} className="text-[#a78bfa] hover:underline">
            host controls
          </Link>
          .
        </p>
      )}

      {/* ---------------- Join the Game ---------------- */}
      {!finished && (
        <section className="sa-hg-card sa-hg-join" aria-labelledby="hg-join">
          <JoinArt className="sa-hg-join-art" />
          <div className="relative z-10 flex items-start gap-4">
            <span className="sa-hg-card-icon" aria-hidden>
              <svg {...svg} className="h-6 w-6">
                <circle cx="9" cy="8" r="3.5" />
                <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
                <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
              </svg>
            </span>
            <div>
              <h2 id="hg-join" className="text-2xl font-black tracking-tight">
                Join the Game
              </h2>
              <p className="mt-0.5 text-rahoot-muted">Players can join by scanning the QR code or using the PIN.</p>
            </div>
          </div>

          <div className="sa-hg-join-body">
            <div className="flex flex-col items-center gap-4">
              <div className="sa-hg-qr">
                <Image src={qrDataUrl} alt={`QR code to join ${game.title}`} width={200} height={200} unoptimized />
              </div>
              <a href={qrDataUrl} download={`hootarena-${game.pin}-qr.png`} className="sa-hg-outline-btn">
                <svg {...svg} className="h-5 w-5">
                  <path d="M12 4v11M7 10.5l5 5 5-5M4.5 19.5h15" />
                </svg>
                Download QR
              </a>
            </div>
            <span className="sa-hg-divider" aria-hidden />
            <div className="flex min-w-0 flex-col gap-5">
              <div>
                <p className="mb-2 font-semibold">Game PIN</p>
                <div className="sa-hg-pin">
                  <p className="font-mono">{game.pin}</p>
                  <CopyTextButton value={game.pin} label="Game PIN" />
                </div>
              </div>
              <div className="min-w-0">
                <p className="mb-2 font-semibold">Join Link</p>
                <div className="sa-hg-link">
                  <svg {...svg} className="h-5 w-5 flex-none text-rahoot-muted">
                    <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
                  </svg>
                  <a href={joinUrl} className="min-w-0 flex-1 truncate">
                    {joinUrl}
                  </a>
                  <CopyTextButton value={joinUrl} label="join link" />
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ---------------- Questions ---------------- */}
      <section className="sa-hg-card" aria-labelledby="hg-questions">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <span className="sa-hg-card-icon" aria-hidden>
              <svg {...svg} className="h-6 w-6">
                <path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" />
                <path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5" />
              </svg>
            </span>
            <h2 id="hg-questions" className="text-2xl font-black tracking-tight">
              Questions <span className="font-semibold text-rahoot-muted">({questions.length})</span>
            </h2>
          </div>
          {editable && (
            <Link href={`/admin/hootarena/${game.id}/questions/new`} className="sa-br-primary">
              <svg {...svg} strokeWidth={2.4} className="h-5 w-5">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add Question
            </Link>
          )}
        </div>

        {questions.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed border-[var(--sa-panel-border)] p-6 text-center text-sm text-rahoot-muted">
            No questions yet. {editable ? "Add at least one before opening the lobby." : ""}
          </p>
        ) : (
          <ol className="mt-5 flex flex-col gap-2.5">
            {questions.map((q, i) => {
              const removeQuestion = deleteHootQuestion.bind(null, game.id, q.id);
              const moveUp = moveHootQuestion.bind(null, game.id, q.id, "up");
              const moveDown = moveHootQuestion.bind(null, game.id, q.id, "down");
              const correctText = q.options.filter((o) => o.isCorrect).map((o) => o.text).join(", ");
              return (
                <li key={q.id} className="sa-hg-q">
                  {editable ? (
                    <div className="sa-hg-move">
                      <form action={moveUp}>
                        <button type="submit" disabled={i === 0} title="Move up" aria-label={`Move question ${i + 1} up`}>
                          <svg {...svg} strokeWidth={2.4} className="h-4 w-4">
                            <path d="m6 14 6-6 6 6" />
                          </svg>
                        </button>
                      </form>
                      <form action={moveDown}>
                        <button type="submit" disabled={i === questions.length - 1} title="Move down" aria-label={`Move question ${i + 1} down`}>
                          <svg {...svg} strokeWidth={2.4} className="h-4 w-4">
                            <path d="m6 10 6 6 6-6" />
                          </svg>
                        </button>
                      </form>
                    </div>
                  ) : (
                    <span className="sa-hg-grip" aria-hidden>
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
                        <circle cx="9" cy="6" r="1.6" />
                        <circle cx="15" cy="6" r="1.6" />
                        <circle cx="9" cy="12" r="1.6" />
                        <circle cx="15" cy="12" r="1.6" />
                        <circle cx="9" cy="18" r="1.6" />
                        <circle cx="15" cy="18" r="1.6" />
                      </svg>
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="break-words text-lg font-bold">
                        {i + 1}. {q.text}
                      </span>
                      <span className="sa-hg-type">{TYPE_LABELS[q.type]}</span>
                    </p>
                    <p className="mt-1 flex items-start gap-2 text-sm text-rahoot-muted">
                      <svg {...svg} strokeWidth={2.2} className="mt-px h-[18px] w-[18px] flex-none text-[#4ade80]">
                        <circle cx="12" cy="12" r="9" />
                        <path d="m8.3 12.3 2.6 2.6 5-5.4" />
                      </svg>
                      <span className="break-words">Correct: {correctText || "-"}</span>
                    </p>
                  </div>
                  {editable && (
                    <div className="flex shrink-0 gap-2.5">
                      <Link href={`/admin/hootarena/${game.id}/questions/${q.id}/edit`} className="sa-hg-icon-btn" aria-label="Edit" title="Edit question">
                        <IconPencil />
                      </Link>
                      <form action={removeQuestion}>
                        <button type="submit" className="sa-ha-delete !h-12 !w-12" aria-label="Delete" title="Delete question">
                          <svg {...svg} className="h-5 w-5">
                            <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" />
                          </svg>
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
    </div>
  );
}
