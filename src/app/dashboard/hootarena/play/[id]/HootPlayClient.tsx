"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getHootSocket } from "@/lib/hootarena/socket-client";
import type {
  HootClientQuestion,
  HootRevealPayload,
  HootLobbyPlayer,
  HootYourLeaderboardPayload,
  HootYourAnswerResultPayload,
  HootKickedPayload,
} from "@/lib/hootarena/socket-events";
import { HootTop3 } from "@/components/HootLeaderboard";
import { OptionGrid, OptionTile } from "@/components/AnswerTiles";

type Phase = "connecting" | "lobby" | "question" | "reveal" | "leaderboard" | "finished" | "kicked";

export function HootPlayClient({ gameId, username }: { gameId: string; username: string }) {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [players, setPlayers] = useState<HootLobbyPlayer[]>([]);
  const [question, setQuestion] = useState<HootClientQuestion | null>(null);
  const [reveal, setReveal] = useState<HootRevealPayload | null>(null);
  const [yourResult, setYourResult] = useState<HootYourAnswerResultPayload | null>(null);
  const [standing, setStanding] = useState<HootYourLeaderboardPayload | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [kickReason, setKickReason] = useState<HootKickedPayload["reason"] | null>(null);

  useEffect(() => {
    const socket = getHootSocket();

    // Re-run on every (re)connect, not just once at mount - socket.io
    // reconnects transparently after a network blip/tab suspend without a
    // page reload, which hands the server a brand-new socket with none of
    // the old one's room membership or socket.data. Without re-joining,
    // the client is silently stranded: it looks connected locally, but the
    // server no longer has it in the game room, so no further events ever
    // arrive and the student has to manually refresh to recover. player:join
    // is already idempotent and fully phase-aware (see restoreHootStateForSocket
    // server-side), so calling it again here is exactly "ask the server for
    // the current authoritative state", not a fresh join.
    const join = () => {
      socket.emit("player:join", { gameId }, (ok, err) => {
        if (!ok) {
          setError(err ?? "Could not join this game.");
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
      setYourResult(null);
      setHasAnswered(false);
      setSelectedIds([]);
      setPhase("question");
    };
    const onReveal = (r: HootRevealPayload) => {
      setReveal(r);
      setPhase("reveal");
    };
    const onLeaderboard = (payload: HootYourLeaderboardPayload) => {
      setStanding(payload);
      setPhase("leaderboard");
    };
    const onFinished = (payload: HootYourLeaderboardPayload) => {
      setStanding(payload);
      setPhase("finished");
    };
    const onYourResult = (r: HootYourAnswerResultPayload) => {
      setYourResult(r);
      setHasAnswered(true); // covers the reconnect-replay case, arriving before any tile was ever tapped this session
    };
    const onKicked = (payload: HootKickedPayload) => {
      setKickReason(payload.reason);
      setPhase("kicked");
    };

    socket.on("lobby:update", onLobby);
    socket.on("phase:question", onQuestion);
    socket.on("phase:reveal", onReveal);
    socket.on("leaderboard:you", onLeaderboard);
    socket.on("finished:you", onFinished);
    socket.on("answer:you", onYourResult);
    socket.on("kicked", onKicked);

    return () => {
      socket.off("connect", join);
      socket.off("lobby:update", onLobby);
      socket.off("phase:question", onQuestion);
      socket.off("phase:reveal", onReveal);
      socket.off("leaderboard:you", onLeaderboard);
      socket.off("finished:you", onFinished);
      socket.off("answer:you", onYourResult);
      socket.off("kicked", onKicked);
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

  function submitAnswer(ids: string[]) {
    if (!question || hasAnswered) return;
    setSelectedIds(ids);
    setHasAnswered(true);
    getHootSocket().emit("player:answer", { gameId, questionId: question.questionId, selectedOptionIds: ids });
  }

  function tapOption(optionId: string) {
    if (!question || hasAnswered) return;
    if (question.type === "MULTIPLE_CHOICE") {
      setSelectedIds((prev) => (prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]));
    } else {
      // Single Choice / True-False: tapping a tile submits immediately, same feel as the legacy live-quiz mode.
      submitAnswer([optionId]);
    }
  }

  if (error) {
    return (
      <Centered>
        <p className="font-semibold text-rahoot-red">{error}</p>
        <Link href="/dashboard/hootarena" className="btn btn-outline mt-4">
          Back
        </Link>
      </Centered>
    );
  }

  if (phase === "kicked") {
    return (
      <Centered>
        <p className="font-semibold text-rahoot-red">
          {kickReason === "duplicate-session"
            ? "You joined this game from another device or tab, so this session was disconnected."
            : "You've been disconnected from this game."}
        </p>
        <Link href="/dashboard/hootarena" className="btn btn-outline mt-4">
          Back
        </Link>
      </Centered>
    );
  }

  if (phase === "connecting") {
    return (
      <Centered>
        <p className="text-rahoot-muted">Connecting...</p>
      </Centered>
    );
  }

  if (phase === "lobby") {
    return (
      <Centered>
        <p className="text-sm font-bold uppercase tracking-wide text-rahoot-red">HootArena</p>
        <h1 className="mt-2 text-2xl font-bold">You&apos;re in, {username}!</h1>
        <p className="mt-1 text-rahoot-muted">Waiting for your teacher to start...</p>
        <p className="mt-8 text-sm font-semibold text-rahoot-muted">
          {players.length} player{players.length === 1 ? "" : "s"} in the lobby
        </p>
        <div className="mt-3 flex max-w-md flex-wrap justify-center gap-2">
          {players.map((p) => (
            <span key={p.userId} className="badge bg-rahoot-red-light text-rahoot-red-dark">
              {p.username}
            </span>
          ))}
        </div>
      </Centered>
    );
  }

  if (phase === "question" && question) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-8">
        <div className="flex items-center justify-between text-sm font-bold text-rahoot-muted">
          <span>
            Question {question.index + 1} of {question.total}
          </span>
          <span className={timeLeft <= 5 ? "text-rahoot-red" : ""}>{timeLeft}s</span>
        </div>
        <h1 className="mt-3 text-center text-xl font-bold">{question.text}</h1>

        <div className="mt-8">
          <OptionGrid>
            {question.options.map((opt) => (
              <OptionTile
                key={opt.id}
                onClick={() => tapOption(opt.id)}
                state={!hasAnswered ? (selectedIds.includes(opt.id) ? "selected" : "idle") : selectedIds.includes(opt.id) ? "selected" : "dimmed"}
              >
                {opt.text}
              </OptionTile>
            ))}
          </OptionGrid>
        </div>

        {question.type === "MULTIPLE_CHOICE" && !hasAnswered && (
          <button onClick={() => submitAnswer(selectedIds)} disabled={selectedIds.length === 0} className="btn btn-primary mt-6">
            Submit Answer
          </button>
        )}

        {hasAnswered && (
          <p className="mt-4 text-center text-sm font-semibold text-rahoot-muted">
            Locked in - waiting for the others...
          </p>
        )}
      </div>
    );
  }

  if (phase === "reveal" && reveal) {
    return (
      <Centered>
        {yourResult ? (
          <p className={`text-2xl font-black ${yourResult.isCorrect ? "text-green-600" : "text-rahoot-red"}`}>
            {yourResult.isCorrect ? "Correct!" : "Not quite"}
          </p>
        ) : (
          <p className="text-2xl font-black text-rahoot-muted">Time&apos;s up!</p>
        )}
        {yourResult && yourResult.pointsAwarded > 0 && (
          <p className="mt-1 text-lg font-bold text-rahoot-red">+{yourResult.pointsAwarded} points</p>
        )}
        <p className="mt-6 text-sm text-rahoot-muted">
          {reveal.answeredCount}/{reveal.totalPlayers} answered
        </p>
        <p className="mt-6 text-sm text-rahoot-muted">Waiting for the leaderboard...</p>
      </Centered>
    );
  }

  if ((phase === "leaderboard" || phase === "finished") && standing) {
    return (
      <Centered>
        {phase === "finished" ? (
          <>
            <p className="text-sm font-bold uppercase tracking-wide text-rahoot-red">Game over!</p>
            <h1 className="mt-2 text-2xl font-bold">Your final score</h1>
          </>
        ) : (
          <p className="text-sm font-bold uppercase tracking-wide text-rahoot-muted">Leaderboard so far</p>
        )}
        <p className="mt-2 text-4xl font-black">{standing.yourScore.toLocaleString()}</p>
        {standing.youAreInTop3 && <p className="mt-1 text-sm font-semibold text-rahoot-red">You&apos;re in the top 3! 🎉</p>}
        <div className="mt-6 w-full max-w-sm">
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-rahoot-muted">Top 3</p>
          <HootTop3 top3={standing.top3} />
        </div>
        {phase === "leaderboard" && <p className="mt-6 text-sm text-rahoot-muted">Waiting for the next question...</p>}
        {phase === "finished" && (
          <Link href="/dashboard/hootarena" className="btn btn-outline mt-8">
            Back to HootArena
          </Link>
        )}
      </Centered>
    );
  }

  return (
    <Centered>
      <p className="text-rahoot-muted">Loading...</p>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">{children}</div>;
}
