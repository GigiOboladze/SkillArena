"use client";

import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket-client";
import type {
  ClientQuestion,
  RevealPayload,
  FinishedPayload,
  LivePlayer,
  YourResultPayload,
} from "@/lib/socket-events";
import { Leaderboard } from "@/components/Leaderboard";
import { OptionGrid, OptionTile } from "@/components/AnswerTiles";

type Phase = "connecting" | "lobby" | "question" | "reveal" | "finished";

export function LiveGame({
  homeworkId,
  homeworkTitle,
  studentId,
  clientToken,
  firstName,
}: {
  homeworkId: string;
  homeworkTitle: string;
  studentId: string;
  clientToken: string;
  firstName: string;
}) {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [players, setPlayers] = useState<LivePlayer[]>([]);
  const [question, setQuestion] = useState<ClientQuestion | null>(null);
  const [reveal, setReveal] = useState<RevealPayload | null>(null);
  const [finished, setFinished] = useState<FinishedPayload | null>(null);
  const [yourResult, setYourResult] = useState<YourResultPayload | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const socket = getSocket();

    // Re-run on every (re)connect, not just once at mount - socket.io
    // reconnects transparently after a network blip or tab suspend without a
    // page reload, handing the server a brand-new socket with none of the old
    // one's room membership or socket.data. Without re-joining, this client is
    // silently stranded: it still looks connected locally, but the server no
    // longer has it in the `hw:` room, so no further phase events arrive and
    // the student must manually refresh to recover. lobby:join is idempotent
    // (it re-verifies the same studentId/clientToken and replays the current
    // phase via sendCurrentPhaseTo), so calling it again is simply "ask the
    // server for the current authoritative state".
    const join = () => {
      socket.emit("lobby:join", { homeworkId, studentId, clientToken }, (ok, err) => {
        if (!ok) {
          setError(err ?? "Could not join this session.");
          return;
        }
        setPhase((p) => (p === "connecting" ? "lobby" : p));
      });
    };

    if (socket.connected) join();
    socket.on("connect", join);

    const onLobby = ({ students }: { students: LivePlayer[] }) => setPlayers(students);
    const onQuestion = (q: ClientQuestion) => {
      setQuestion(q);
      setReveal(null);
      setYourResult(null);
      setHasAnswered(false);
      setSelectedOptionId(null);
      setTextAnswer("");
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
    const onYourResult = (r: YourResultPayload) => setYourResult(r);
    const onLobbyPhase = () => {
      setQuestion(null);
      setReveal(null);
      setFinished(null);
      setYourResult(null);
      setHasAnswered(false);
      setSelectedOptionId(null);
      setTextAnswer("");
      setPhase("lobby");
    };

    socket.on("lobby:update", onLobby);
    socket.on("phase:question", onQuestion);
    socket.on("phase:reveal", onReveal);
    socket.on("phase:finished", onFinished);
    socket.on("phase:lobby", onLobbyPhase);
    socket.on("answer:you", onYourResult);

    return () => {
      socket.off("connect", join);
      socket.off("lobby:update", onLobby);
      socket.off("phase:question", onQuestion);
      socket.off("phase:reveal", onReveal);
      socket.off("phase:finished", onFinished);
      socket.off("phase:lobby", onLobbyPhase);
      socket.off("answer:you", onYourResult);
    };
  }, [homeworkId, studentId, clientToken]);

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

  // Multiple choice submits the instant a tile is tapped - no separate
  // submit step. Paragraph answers still need an explicit submit since
  // there's no single "click" that means "this is my answer" for free text.
  function selectMultipleChoice(optionId: string) {
    if (!question || hasAnswered || question.type !== "MULTIPLE_CHOICE") return;
    setSelectedOptionId(optionId);
    setHasAnswered(true);
    getSocket().emit("student:answer", {
      homeworkId,
      questionId: question.questionId,
      selectedOptionId: optionId,
    });
  }

  function submitParagraph() {
    if (!question || hasAnswered || question.type !== "PARAGRAPH" || !textAnswer.trim()) return;
    getSocket().emit("student:answer", {
      homeworkId,
      questionId: question.questionId,
      textAnswer,
    });
    setHasAnswered(true);
  }

  if (error) {
    return (
      <Centered>
        <p className="text-lg font-semibold text-rahoot-red">{error}</p>
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
        <p className="text-sm font-bold uppercase tracking-wide text-rahoot-red">
          {homeworkTitle}
        </p>
        <h1 className="mt-2 text-2xl font-bold">You&apos;re in, {firstName}!</h1>
        <p className="mt-1 text-rahoot-muted">Waiting for your teacher to start...</p>
        <p className="mt-8 text-sm font-semibold text-rahoot-muted">
          {players.length} player{players.length === 1 ? "" : "s"} in the lobby
        </p>
        <div className="mt-3 flex max-w-md flex-wrap justify-center gap-2">
          {players.map((p) => (
            <span key={p.studentId} className="badge bg-rahoot-red-light text-rahoot-red-dark">
              {p.firstName} {p.lastName}
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

        {question.type === "MULTIPLE_CHOICE" ? (
          <>
            <div className="mt-8">
              <OptionGrid>
                {question.options.map((opt) => (
                  <OptionTile
                    key={opt.id}
                    onClick={() => selectMultipleChoice(opt.id)}
                    state={!hasAnswered ? "idle" : opt.id === selectedOptionId ? "selected" : "dimmed"}
                  >
                    {opt.text}
                  </OptionTile>
                ))}
              </OptionGrid>
            </div>
            {hasAnswered && (
              <p className="mt-4 text-center text-sm font-semibold text-rahoot-muted">
                Locked in - waiting for the others...
              </p>
            )}
          </>
        ) : hasAnswered ? (
          <p className="mt-8 text-center font-semibold text-rahoot-muted">
            Answer locked in - waiting for the others...
          </p>
        ) : (
          <>
            <textarea
              value={textAnswer}
              onChange={(e) => setTextAnswer(e.target.value)}
              rows={5}
              maxLength={5000}
              placeholder="Type your answer..."
              className="input mt-8"
              autoFocus
            />
            <button
              onClick={submitParagraph}
              disabled={!textAnswer.trim()}
              className="btn btn-primary mt-6"
            >
              Submit answer
            </button>
          </>
        )}
      </div>
    );
  }

  if (phase === "reveal" && reveal) {
    return (
      <Centered>
        {reveal.type === "MULTIPLE_CHOICE" ? (
          yourResult ? (
            <p className={`text-2xl font-black ${yourResult.isCorrect ? "text-green-600" : "text-rahoot-red"}`}>
              {yourResult.isCorrect ? "Correct!" : "Not quite"}
            </p>
          ) : (
            <p className="text-2xl font-black text-rahoot-muted">Time&apos;s up!</p>
          )
        ) : (
          <p className="text-2xl font-black text-rahoot-muted">Answer submitted for grading</p>
        )}
        {yourResult && yourResult.pointsAwarded > 0 && (
          <p className="mt-1 text-lg font-bold text-rahoot-red">+{yourResult.pointsAwarded} points</p>
        )}
        <p className="mt-8 text-sm font-bold uppercase tracking-wide text-rahoot-muted">
          Leaderboard so far
        </p>
        <div className="mt-3 w-full max-w-sm">
          <Leaderboard entries={reveal.leaderboard.slice(0, 5)} />
        </div>
        <p className="mt-6 text-sm text-rahoot-muted">Waiting for the next question...</p>
      </Centered>
    );
  }

  if (phase === "finished" && finished) {
    return (
      <Centered>
        <p className="text-sm font-bold uppercase tracking-wide text-rahoot-red">Game over!</p>
        <h1 className="mt-2 text-2xl font-bold">Final leaderboard</h1>
        <div className="mt-6 w-full max-w-sm">
          <Leaderboard entries={finished.leaderboard} />
        </div>
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
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      {children}
    </div>
  );
}
