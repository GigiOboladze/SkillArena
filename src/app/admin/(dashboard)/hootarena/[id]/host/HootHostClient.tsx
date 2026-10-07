"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getHootSocket } from "@/lib/hootarena/socket-client";
import type {
  HootClientQuestion,
  HootAdminRevealPayload,
  HootLobbyPlayer,
  HootHostLeaderboardPayload,
} from "@/lib/hootarena/socket-events";
import { HootLeaderboard } from "@/components/HootLeaderboard";

type Phase = "connecting" | "lobby" | "question" | "reveal" | "leaderboard" | "finished";

export function HootHostClient({
  gameId,
  title,
  pin,
  totalQuestions,
}: {
  gameId: string;
  title: string;
  pin: string;
  totalQuestions: number;
}) {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [players, setPlayers] = useState<HootLobbyPlayer[]>([]);
  const [question, setQuestion] = useState<HootClientQuestion | null>(null);
  const [reveal, setReveal] = useState<HootAdminRevealPayload | null>(null);
  const [board, setBoard] = useState<HootHostLeaderboardPayload | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const socket = getHootSocket();

    // Re-run on every (re)connect, not just once at mount - see the
    // identical comment in HootPlayClient. A host losing wifi for a few
    // seconds mid-class must not lose control of the game.
    const join = () => {
      socket.emit("host:join", { gameId }, (ok, err) => {
        if (!ok) {
          setError(err ?? "Could not host this game - this account doesn't have access to it.");
          return;
        }
        setPhase((p) => (p === "connecting" ? "lobby" : p));
      });
    };

    if (socket.connected) join();
    socket.on("connect", join);

    const onLobby = ({ players }: { players: HootLobbyPlayer[] }) => setPlayers(players);
    const onQuestion = (q: HootClientQuestion) => {
      setQuestion(q);
      setReveal(null);
      setAnsweredCount(0);
      setPhase("question");
    };
    const onReveal = (r: HootAdminRevealPayload) => {
      setReveal(r);
      setPhase("reveal");
    };
    const onLeaderboard = (payload: HootHostLeaderboardPayload) => {
      setBoard(payload);
      setPhase("leaderboard");
    };
    const onFinished = (payload: HootHostLeaderboardPayload) => {
      setBoard(payload);
      setPhase("finished");
    };
    const onCount = ({ answered }: { answered: number; total: number }) => setAnsweredCount(answered);

    socket.on("lobby:update", onLobby);
    socket.on("phase:question", onQuestion);
    socket.on("phase:reveal:host", onReveal);
    socket.on("leaderboard:host", onLeaderboard);
    socket.on("finished:host", onFinished);
    socket.on("answer:count", onCount);

    return () => {
      socket.off("connect", join);
      socket.off("lobby:update", onLobby);
      socket.off("phase:question", onQuestion);
      socket.off("phase:reveal:host", onReveal);
      socket.off("leaderboard:host", onLeaderboard);
      socket.off("finished:host", onFinished);
      socket.off("answer:count", onCount);
    };
  }, [gameId]);

  useEffect(() => {
    if (phase !== "question" || !question) return;
    const tick = () => {
      const elapsed = (Date.now() - question.startedAt) / 1000;
      setTimeLeft(Math.max(0, Math.ceil(question.timeLimitSec - elapsed)));
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [phase, question]);

  const start = () => getHootSocket().emit("host:start", { gameId });
  const next = () => getHootSocket().emit("host:next", { gameId });
  const end = () => {
    if (window.confirm("End this game now? Every player is moved to the final results immediately.")) {
      getHootSocket().emit("host:end", { gameId });
    }
  };

  if (error) {
    return (
      <Centered>
        <p className="font-semibold text-rahoot-red">{error}</p>
        <Link href="/admin/hootarena" className="btn btn-outline mt-4">
          Back to HootArena
        </Link>
      </Centered>
    );
  }

  const isLastQuestion = question ? question.index === totalQuestions - 1 : false;
  const nextLabel =
    phase === "question" ? "Reveal answer" : phase === "reveal" ? "Show leaderboard" : isLastQuestion ? "Finish game" : "Next question";

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-rahoot-border pb-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-rahoot-red">Hosting</p>
          <h1 className="text-xl font-bold">{title}</h1>
        </div>
        <Link href={`/admin/hootarena/${gameId}`} className="btn btn-outline !py-1.5 !px-3 text-sm">
          Exit
        </Link>
      </div>

      {phase === "connecting" && (
        <Centered>
          <p className="text-rahoot-muted">Connecting...</p>
        </Centered>
      )}

      {phase === "lobby" && (
        <Centered>
          <p className="text-sm font-bold uppercase tracking-wide text-rahoot-muted">Game PIN</p>
          <p className="mt-1 text-5xl font-black tracking-widest text-rahoot-red">{pin}</p>
          <p className="mt-6 text-4xl font-black">{players.length}</p>
          <p className="text-rahoot-muted">player{players.length === 1 ? "" : "s"} joined</p>
          <div className="mt-4 flex max-w-lg flex-wrap justify-center gap-2">
            {players.map((p) => (
              <span key={p.playerId} className="badge bg-rahoot-red-light text-rahoot-red-dark">
                {p.username}
              </span>
            ))}
          </div>
          <button onClick={start} disabled={totalQuestions === 0 || players.length === 0} className="btn btn-primary mt-8">
            Start game
          </button>
          {totalQuestions === 0 && <p className="mt-2 text-sm text-rahoot-red">Add at least one question first.</p>}
          {players.length === 0 && totalQuestions > 0 && (
            <p className="mt-2 text-sm text-rahoot-muted">Waiting for at least one player to join.</p>
          )}
        </Centered>
      )}

      {phase === "question" && question && (
        <Centered>
          <p className="text-sm font-bold text-rahoot-muted">
            Question {question.index + 1} of {question.total}
          </p>
          <h2 className="mt-2 max-w-xl text-2xl font-bold">{question.text}</h2>
          <p className={`mt-4 text-3xl font-black ${timeLeft <= 5 ? "text-rahoot-red" : ""}`}>{timeLeft}s</p>
          <p className="mt-2 text-rahoot-muted">
            {answeredCount}/{players.length} answered
          </p>
          <button onClick={next} className="btn btn-primary mt-8">
            {nextLabel}
          </button>
        </Centered>
      )}

      {phase === "reveal" && reveal && (
        <Centered>
          <p className="text-sm font-bold uppercase tracking-wide text-rahoot-muted">Results</p>
          <h2 className="mt-2 max-w-xl text-xl font-bold">{reveal.text}</h2>
          <div className="mt-6 w-full max-w-lg text-left">
            {reveal.options.map((opt) => (
              <div
                key={opt.optionId}
                className={`relative mb-2 overflow-hidden rounded-lg border-2 p-3 ${
                  opt.isCorrect ? "border-rahoot-red" : "border-rahoot-border"
                }`}
              >
                <div
                  className={`absolute inset-y-0 left-0 ${opt.isCorrect ? "bg-rahoot-red-light" : "bg-rahoot-border/30"}`}
                  style={{ width: `${opt.percentage}%` }}
                  aria-hidden
                />
                <div className="relative flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {opt.text}
                    {opt.isCorrect && <span className="badge badge-success !px-1.5">Correct</span>}
                  </span>
                  <span className="shrink-0 text-sm font-black">
                    {opt.count} {opt.count === 1 ? "student" : "students"}{" "}
                    <span className="font-normal text-rahoot-muted">({opt.percentage}%)</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-rahoot-muted">
            {reveal.answeredCount}/{reveal.totalPlayers} answered
            {reveal.unansweredCount > 0 && <> &middot; {reveal.unansweredCount} not answered</>}
          </p>
          <button onClick={next} className="btn btn-primary mt-8">
            {nextLabel}
          </button>
        </Centered>
      )}

      {phase === "leaderboard" && board && (
        <Centered>
          <p className="text-sm font-bold uppercase tracking-wide text-rahoot-muted">Leaderboard</p>
          <div className="mt-4 w-full max-w-sm">
            <HootLeaderboard entries={board.leaderboard} />
          </div>
          <button onClick={next} className="btn btn-primary mt-8">
            {nextLabel}
          </button>
        </Centered>
      )}

      {phase === "finished" && board && (
        <Centered>
          <p className="text-sm font-bold uppercase tracking-wide text-rahoot-red">Game over!</p>
          <h2 className="mt-2 text-2xl font-bold">Final results</h2>
          <div className="mt-6 w-full max-w-sm">
            <HootLeaderboard entries={board.leaderboard} />
          </div>
          <Link href="/admin/hootarena" className="btn btn-outline mt-8">
            Back to HootArena
          </Link>
        </Centered>
      )}

      {(phase === "lobby" || phase === "question" || phase === "reveal" || phase === "leaderboard") && (
        <div className="mt-auto flex justify-center pt-6">
          <button onClick={end} className="text-sm text-rahoot-muted hover:text-rahoot-red">
            End game early
          </button>
        </div>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">{children}</div>;
}
