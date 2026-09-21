"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSocket } from "@/lib/socket-client";
import type {
  ClientQuestion,
  RevealPayload,
  FinishedPayload,
  LivePlayer,
} from "@/lib/socket-events";
import { Leaderboard } from "@/components/Leaderboard";

type Phase = "connecting" | "lobby" | "question" | "reveal" | "finished";

export function HostClient({
  homeworkId,
  title,
  totalQuestions,
}: {
  homeworkId: string;
  title: string;
  totalQuestions: number;
}) {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [players, setPlayers] = useState<LivePlayer[]>([]);
  const [question, setQuestion] = useState<ClientQuestion | null>(null);
  const [reveal, setReveal] = useState<RevealPayload | null>(null);
  const [finished, setFinished] = useState<FinishedPayload | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const socket = getSocket();

    socket.emit("host:join", { homeworkId }, (ok, err) => {
      if (!ok) {
        setError(err ?? "Could not host this session - this browser doesn't have access to it.");
        return;
      }
      setPhase((p) => (p === "connecting" ? "lobby" : p));
    });

    const onLobby = ({ students }: { students: LivePlayer[] }) => setPlayers(students);
    const onQuestion = (q: ClientQuestion) => {
      setQuestion(q);
      setReveal(null);
      setAnsweredCount(0);
      setPhase("question");
    };
    const onReveal = (r: RevealPayload) => {
      setReveal(r);
      setPhase("reveal");
    };
    const onFinished = (f: FinishedPayload) => {
      setFinished(f);
      setPhase("finished");
    };
    const onCount = ({ answered }: { answered: number; total: number }) =>
      setAnsweredCount(answered);
    const onLobbyPhase = () => {
      setQuestion(null);
      setReveal(null);
      setFinished(null);
      setAnsweredCount(0);
      setPhase("lobby");
    };

    socket.on("lobby:update", onLobby);
    socket.on("phase:question", onQuestion);
    socket.on("phase:reveal", onReveal);
    socket.on("phase:finished", onFinished);
    socket.on("phase:lobby", onLobbyPhase);
    socket.on("answer:count", onCount);

    return () => {
      socket.off("lobby:update", onLobby);
      socket.off("phase:question", onQuestion);
      socket.off("phase:reveal", onReveal);
      socket.off("phase:finished", onFinished);
      socket.off("phase:lobby", onLobbyPhase);
      socket.off("answer:count", onCount);
    };
  }, [homeworkId]);

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

  const start = () => getSocket().emit("host:start", { homeworkId });
  const next = () => getSocket().emit("host:next", { homeworkId });
  const end = () => getSocket().emit("host:end", { homeworkId });
  const restart = () => {
    if (
      window.confirm(
        "Restart the game? This deletes every answer already submitted for this homework and sends everyone back to the lobby."
      )
    ) {
      getSocket().emit("host:restart", { homeworkId });
    }
  };

  if (error) {
    return (
      <Centered>
        <p className="font-semibold text-rahoot-red">{error}</p>
        <Link href={`/homeworks/${homeworkId}`} className="btn btn-outline mt-4">
          Back
        </Link>
      </Centered>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-rahoot-border pb-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-rahoot-red">Hosting</p>
          <h1 className="text-xl font-bold">{title}</h1>
        </div>
        <Link href={`/homeworks/${homeworkId}`} className="btn btn-outline !py-1.5 !px-3 text-sm">
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
          <p className="text-sm font-bold uppercase tracking-wide text-rahoot-muted">
            Waiting in the lobby
          </p>
          <p className="mt-1 text-4xl font-black">{players.length}</p>
          <p className="text-rahoot-muted">player{players.length === 1 ? "" : "s"} joined</p>
          <div className="mt-4 flex max-w-lg flex-wrap justify-center gap-2">
            {players.map((p) => (
              <span key={p.studentId} className="badge bg-rahoot-red-light text-rahoot-red-dark">
                {p.firstName} {p.lastName}
              </span>
            ))}
          </div>
          <button
            onClick={start}
            disabled={totalQuestions === 0 || players.length === 0}
            className="btn btn-primary mt-8"
          >
            Start game
          </button>
          {totalQuestions === 0 && (
            <p className="mt-2 text-sm text-rahoot-red">Add at least one question first.</p>
          )}
        </Centered>
      )}

      {phase === "question" && question && (
        <Centered>
          <p className="text-sm font-bold text-rahoot-muted">
            Question {question.index + 1} of {question.total}
          </p>
          <h2 className="mt-2 max-w-xl text-2xl font-bold">{question.text}</h2>
          <p className={`mt-4 text-3xl font-black ${timeLeft <= 5 ? "text-rahoot-red" : ""}`}>
            {timeLeft}s
          </p>
          <p className="mt-2 text-rahoot-muted">
            {answeredCount}/{players.length} answered
          </p>
          <button onClick={next} className="btn btn-primary mt-8">
            Reveal answer
          </button>
        </Centered>
      )}

      {phase === "reveal" && reveal && (
        <Centered>
          <p className="text-sm font-bold uppercase tracking-wide text-rahoot-muted">Results</p>
          {reveal.type === "MULTIPLE_CHOICE" && (
            <div className="mt-4 w-full max-w-md text-left">
              {Object.entries(reveal.optionCounts).map(([optionId, count]) => {
                const isCorrect = optionId === reveal.correctOptionId;
                return (
                  <div
                    key={optionId}
                    className={`mb-2 flex items-center gap-3 rounded-lg border-2 p-2 text-sm font-semibold ${
                      isCorrect
                        ? "border-rahoot-red bg-rahoot-red text-[color:var(--on-primary)]"
                        : "border-rahoot-red bg-rahoot-surface text-rahoot-red"
                    }`}
                  >
                    <span>
                      {count} answer{count === 1 ? "" : "s"}
                      {isCorrect ? " (correct)" : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {reveal.type === "PARAGRAPH" && (
            <p className="mt-4 text-rahoot-muted">
              {reveal.paragraphSubmitted} answer{reveal.paragraphSubmitted === 1 ? "" : "s"} submitted for grading
            </p>
          )}
          <p className="mt-8 text-sm font-bold uppercase tracking-wide text-rahoot-muted">
            Leaderboard
          </p>
          <div className="mt-3 w-full max-w-sm">
            <Leaderboard entries={reveal.leaderboard.slice(0, 5)} />
          </div>
          <button onClick={next} className="btn btn-primary mt-8">
            Next
          </button>
        </Centered>
      )}

      {phase === "finished" && finished && (
        <Centered>
          <p className="text-sm font-bold uppercase tracking-wide text-rahoot-red">Game over!</p>
          <h2 className="mt-2 text-2xl font-bold">Final leaderboard</h2>
          <div className="mt-6 w-full max-w-sm">
            <Leaderboard entries={finished.leaderboard} />
          </div>
          <div className="mt-8 flex gap-3">
            <Link href={`/homeworks/${homeworkId}`} className="btn btn-outline">
              Back to homework
            </Link>
            <button onClick={restart} className="btn btn-primary">
              Restart game
            </button>
          </div>
        </Centered>
      )}

      {(phase === "lobby" || phase === "question" || phase === "reveal") && (
        <div className="mt-auto flex justify-center gap-4 pt-6">
          <button onClick={restart} className="text-sm text-rahoot-muted hover:text-rahoot-red">
            Restart game
          </button>
          <button onClick={end} className="text-sm text-rahoot-muted hover:text-rahoot-red">
            End session early
          </button>
        </div>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
      {children}
    </div>
  );
}
