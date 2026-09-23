import { createServer } from "node:http";
import next from "next";
import { Server as SocketIOServer, type Socket } from "socket.io";
import { prisma } from "./src/lib/prisma";
import {
  adminSessionCookieName,
  verifySessionEnvelope,
  adminFromEnvelope,
} from "./src/lib/session-core";
import { computeMultipleChoicePoints, getLeaderboard } from "./src/lib/scoring";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  ClientQuestion,
  RevealPayload,
  FinishedPayload,
  LivePlayer,
} from "./src/lib/socket-events";

const port = parseInt(process.env.PORT || "3000", 10);
const hostname = process.env.HOSTNAME || "0.0.0.0";
const dev = process.env.NODE_ENV !== "production";
// Passing hostname/port explicitly matters here: without it, Next's own
// internal self-fetches (e.g. resolving a Server Action's redirect target)
// assume the default port 3000 regardless of what this server actually
// listens on, which silently breaks redirects (like the admin login
// action's) whenever PORT is set to anything else - as it is on Cloud Run.
//
// On Railway (unlike Cloud Run), that self-fetch derives its origin from
// the request's forwarded headers, producing an https:// URL - but Railway
// terminates TLS at its edge and forwards plain HTTP to this container, so
// that self-fetch tries a TLS handshake against a port that only speaks
// HTTP and fails with ERR_SSL_WRONG_VERSION_NUMBER. That failure isn't
// always caught gracefully - server actions that end in redirect() (like
// saving a quiz's target groups) can come back as a 503 instead of
// completing. __NEXT_PRIVATE_ORIGIN is Next's own escape hatch for this
// exact case: when set, action-handler.js uses it directly instead of
// deriving the origin from the request, so the self-fetch correctly stays
// on plain HTTP to this same process instead of round-tripping through a
// protocol it doesn't speak internally.
process.env.__NEXT_PRIVATE_ORIGIN = `http://127.0.0.1:${port}`;
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

type SocketData = {
  homeworkId?: string;
  studentId?: string;
  isHost?: boolean;
};

type LiveState = {
  phase: "LOBBY" | "QUESTION" | "REVEAL" | "FINISHED";
  questionIndex: number;
  startedAt: number | null;
  answeredStudentIds: Set<string>;
  timer: NodeJS.Timeout | null;
  currentQuestionPayload: ClientQuestion | null;
  lastRevealPayload: RevealPayload | null;
  lastFinishedPayload: FinishedPayload | null;
  // Kept in sync by broadcastLobby() so student:answer doesn't need its own
  // `student.count` round trip on every single answer during a live round.
  totalPlayers: number;
};

const liveStates = new Map<string, LiveState>();

function getOrCreateState(homeworkId: string): LiveState {
  let state = liveStates.get(homeworkId);
  if (!state) {
    state = {
      phase: "LOBBY",
      questionIndex: -1,
      startedAt: null,
      answeredStudentIds: new Set(),
      timer: null,
      currentQuestionPayload: null,
      lastRevealPayload: null,
      lastFinishedPayload: null,
      totalPlayers: 0,
    };
    liveStates.set(homeworkId, state);
  }
  return state;
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));

  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents, object, SocketData>(
    httpServer,
    { path: "/socket.io" }
  );

  async function broadcastLobby(homeworkId: string) {
    const students = await prisma.student.findMany({
      where: { homeworkId },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { joinedAt: "asc" },
    });
    const players: LivePlayer[] = students.map((s) => ({
      studentId: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
    }));
    getOrCreateState(homeworkId).totalPlayers = players.length;
    io.to(`hw:${homeworkId}`).emit("lobby:update", { students: players });
  }

  async function startQuestion(homeworkId: string, index: number) {
    const state = getOrCreateState(homeworkId);
    if (state.timer) clearTimeout(state.timer);

    const [question, total] = await Promise.all([
      prisma.question.findFirst({
        where: { homeworkId, order: index },
        include: { options: { orderBy: { order: "asc" } } },
      }),
      prisma.question.count({ where: { homeworkId } }),
    ]);
    if (!question) return;

    const payload: ClientQuestion = {
      questionId: question.id,
      index,
      total,
      type: question.type,
      text: question.text,
      points: question.points,
      timeLimitSec: question.timeLimitSec,
      options: question.options.map((o) => ({ id: o.id, text: o.text })),
      startedAt: Date.now(),
    };

    state.phase = "QUESTION";
    state.questionIndex = index;
    state.startedAt = payload.startedAt;
    state.answeredStudentIds = new Set();
    state.currentQuestionPayload = payload;

    await prisma.homework.update({
      where: { id: homeworkId },
      data: { livePhase: "QUESTION", currentQuestionIndex: index },
    });

    io.to(`hw:${homeworkId}`).emit("phase:question", payload);

    state.timer = setTimeout(() => {
      revealQuestion(homeworkId).catch((err) =>
        console.error("Auto-reveal failed", err)
      );
    }, question.timeLimitSec * 1000 + 500);
  }

  async function buildRevealPayload(
    homeworkId: string,
    questionId: string
  ): Promise<RevealPayload | null> {
    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: { options: true },
    });
    if (!question) return null;

    const answers = await prisma.answer.findMany({ where: { questionId } });
    const optionCounts: Record<string, number> = {};
    for (const opt of question.options) optionCounts[opt.id] = 0;
    let paragraphSubmitted = 0;
    for (const a of answers) {
      if (a.selectedOptionId) {
        optionCounts[a.selectedOptionId] = (optionCounts[a.selectedOptionId] ?? 0) + 1;
      }
      if (question.type === "PARAGRAPH" && a.textAnswer) paragraphSubmitted++;
    }

    const leaderboard = await getLeaderboard(homeworkId);
    return {
      questionId,
      type: question.type,
      correctOptionId: question.options.find((o) => o.isCorrect)?.id ?? null,
      optionCounts,
      paragraphSubmitted,
      leaderboard,
    };
  }

  async function revealQuestion(homeworkId: string) {
    const state = liveStates.get(homeworkId);
    if (!state || state.phase !== "QUESTION" || !state.currentQuestionPayload) return;
    if (state.timer) clearTimeout(state.timer);

    const payload = await buildRevealPayload(homeworkId, state.currentQuestionPayload.questionId);
    if (!payload) return;

    state.phase = "REVEAL";
    state.lastRevealPayload = payload;

    await prisma.homework.update({
      where: { id: homeworkId },
      data: { livePhase: "REVEAL" },
    });

    io.to(`hw:${homeworkId}`).emit("phase:reveal", payload);
  }

  // Live-game state normally lives only in the in-memory `liveStates` Map, so
  // a server restart mid-session would otherwise strand any host/students who
  // reconnect with nothing to show them. `Homework.livePhase` /
  // `currentQuestionIndex` are persisted on every phase transition precisely
  // so this can rebuild in-memory state on boot. A homework caught mid-QUESTION
  // at restart can't have its countdown reliably resumed (the elapsed time
  // and original deadline aren't persisted), so recovery always lands it on
  // REVEAL for that question - using whatever answers were already submitted
  // before the restart - rather than guessing a new deadline.
  async function recoverLiveStates() {
    const homeworks = await prisma.homework.findMany({
      where: { mode: "LIVE", status: "OPEN", livePhase: { in: ["QUESTION", "REVEAL", "FINISHED"] } },
    });

    for (const hw of homeworks) {
      const state = getOrCreateState(hw.id);

      if (hw.livePhase === "FINISHED") {
        state.phase = "FINISHED";
        state.questionIndex = hw.currentQuestionIndex ?? -1;
        state.lastFinishedPayload = { leaderboard: await getLeaderboard(hw.id) };
        continue;
      }

      const index = hw.currentQuestionIndex;
      if (index == null) continue;
      const question = await prisma.question.findFirst({ where: { homeworkId: hw.id, order: index } });
      if (!question) continue;

      const payload = await buildRevealPayload(hw.id, question.id);
      if (!payload) continue;

      state.phase = "REVEAL";
      state.questionIndex = index;
      state.lastRevealPayload = payload;

      if (hw.livePhase !== "REVEAL") {
        await prisma.homework.update({ where: { id: hw.id }, data: { livePhase: "REVEAL" } });
      }
    }

    if (homeworks.length > 0) {
      console.log(`> Recovered ${homeworks.length} in-progress live session(s) from the database`);
    }
  }

  async function finishGame(homeworkId: string) {
    const state = getOrCreateState(homeworkId);
    if (state.timer) clearTimeout(state.timer);

    const leaderboard = await getLeaderboard(homeworkId);
    const payload: FinishedPayload = { leaderboard };
    state.phase = "FINISHED";
    state.lastFinishedPayload = payload;

    await prisma.homework.update({
      where: { id: homeworkId },
      data: { livePhase: "FINISHED" },
    });

    io.to(`hw:${homeworkId}`).emit("phase:finished", payload);
  }

  /** A true do-over: wipes every submitted answer for this homework and resets the live session back to the lobby. */
  async function restartGame(homeworkId: string) {
    const state = getOrCreateState(homeworkId);
    if (state.timer) clearTimeout(state.timer);

    await prisma.answer.deleteMany({ where: { question: { homeworkId } } });

    state.phase = "LOBBY";
    state.questionIndex = -1;
    state.startedAt = null;
    state.answeredStudentIds = new Set();
    state.timer = null;
    state.currentQuestionPayload = null;
    state.lastRevealPayload = null;
    state.lastFinishedPayload = null;

    await prisma.homework.update({
      where: { id: homeworkId },
      data: { livePhase: "LOBBY", currentQuestionIndex: null },
    });

    io.to(`hw:${homeworkId}`).emit("phase:lobby");
    await broadcastLobby(homeworkId);
  }

  function sendCurrentPhaseTo(socket: Socket, homeworkId: string) {
    const state = liveStates.get(homeworkId);
    if (!state) return;
    if (state.phase === "QUESTION" && state.currentQuestionPayload) {
      socket.emit("phase:question", state.currentQuestionPayload);
    } else if (state.phase === "REVEAL" && state.lastRevealPayload) {
      socket.emit("phase:reveal", state.lastRevealPayload);
    } else if (state.phase === "FINISHED" && state.lastFinishedPayload) {
      socket.emit("phase:finished", state.lastFinishedPayload);
    }
  }

  io.on("connection", (socket) => {
    socket.on("lobby:join", async ({ homeworkId, studentId, clientToken }, ack) => {
      try {
        const [student, homework] = await Promise.all([
          prisma.student.findFirst({ where: { id: studentId, homeworkId, clientToken } }),
          prisma.homework.findUnique({ where: { id: homeworkId } }),
        ]);
        if (!student || !homework || homework.mode !== "LIVE") {
          ack(false, "Not found");
          return;
        }
        socket.data.homeworkId = homeworkId;
        socket.data.studentId = studentId;
        socket.join(`hw:${homeworkId}`);
        ack(true);
        await broadcastLobby(homeworkId);
        sendCurrentPhaseTo(socket, homeworkId);
      } catch (err) {
        console.error("lobby:join failed", err);
        ack(false, "Server error");
      }
    });

    socket.on("host:join", async ({ homeworkId }, ack) => {
      try {
        const token = parseCookie(socket.handshake.headers.cookie, adminSessionCookieName());
        const envelope = token ? await verifySessionEnvelope(token) : {};
        const admin = adminFromEnvelope(envelope);

        // Admin can host anything; otherwise this socket needs a creator
        // token matching THIS homework's own (same trust model as every
        // other homework-management check - see homework-auth.ts, which
        // this mirrors since server.ts can't use next/headers).
        let authorized = !!admin;
        if (!authorized) {
          const creatorToken = envelope.creators?.[homeworkId];
          if (creatorToken) {
            const homework = await prisma.homework.findUnique({
              where: { id: homeworkId },
              select: { creatorToken: true },
            });
            authorized = !!homework && homework.creatorToken === creatorToken;
          }
        }

        if (!authorized) {
          ack(false, "Not authorized");
          return;
        }
        socket.data.homeworkId = homeworkId;
        socket.data.isHost = true;
        socket.join(`hw:${homeworkId}`);
        ack(true);
        await broadcastLobby(homeworkId);
        sendCurrentPhaseTo(socket, homeworkId);
      } catch (err) {
        console.error("host:join failed", err);
        ack(false, "Server error");
      }
    });

    socket.on("host:start", ({ homeworkId }) => {
      if (!socket.data.isHost) return;
      startQuestion(homeworkId, 0).catch((err) => console.error("host:start failed", err));
    });

    socket.on("host:next", async ({ homeworkId }) => {
      if (!socket.data.isHost) return;
      const state = liveStates.get(homeworkId);
      if (!state) return;
      try {
        if (state.phase === "QUESTION") {
          await revealQuestion(homeworkId);
        } else if (state.phase === "REVEAL") {
          const total = await prisma.question.count({ where: { homeworkId } });
          const nextIndex = state.questionIndex + 1;
          if (nextIndex >= total) {
            await finishGame(homeworkId);
          } else {
            await startQuestion(homeworkId, nextIndex);
          }
        }
      } catch (err) {
        console.error("host:next failed", err);
      }
    });

    socket.on("host:end", ({ homeworkId }) => {
      if (!socket.data.isHost) return;
      finishGame(homeworkId).catch((err) => console.error("host:end failed", err));
    });

    socket.on("host:restart", ({ homeworkId }) => {
      if (!socket.data.isHost) return;
      restartGame(homeworkId).catch((err) => console.error("host:restart failed", err));
    });

    socket.on("student:answer", async ({ homeworkId, questionId, selectedOptionId, textAnswer }) => {
      const studentId = socket.data.studentId;
      if (!studentId || socket.data.homeworkId !== homeworkId) return;

      const state = liveStates.get(homeworkId);
      if (!state || state.phase !== "QUESTION" || state.answeredStudentIds.has(studentId)) return;

      try {
        const question = await prisma.question.findUnique({
          where: { id: questionId },
          include: { options: true },
        });
        if (!question || question.homeworkId !== homeworkId) return;

        let isCorrect: boolean | null = null;
        let pointsAwarded = 0;
        if (question.type === "MULTIPLE_CHOICE") {
          const opt = question.options.find((o) => o.id === selectedOptionId);
          isCorrect = !!opt?.isCorrect;
          pointsAwarded = computeMultipleChoicePoints({
            isCorrect,
            basePoints: question.points,
            mode: "LIVE",
            elapsedMs: Date.now() - (state.startedAt ?? Date.now()),
            timeLimitSec: question.timeLimitSec,
          });
        }

        await prisma.answer.upsert({
          where: { studentId_questionId: { studentId, questionId } },
          create: {
            studentId,
            questionId,
            selectedOptionId: selectedOptionId ?? null,
            textAnswer: textAnswer ?? null,
            isCorrect,
            pointsAwarded,
          },
          update: {
            selectedOptionId: selectedOptionId ?? null,
            textAnswer: textAnswer ?? null,
            isCorrect,
            pointsAwarded,
          },
        });

        state.answeredStudentIds.add(studentId);
        socket.emit("answer:you", { questionId, isCorrect, pointsAwarded });

        // totalPlayers is kept current by broadcastLobby() - no DB round trip
        // needed on every single answer, which matters once a class-sized
        // burst of students is answering within the same second or two.
        io.to(`hw:${homeworkId}`).emit("answer:count", {
          answered: state.answeredStudentIds.size,
          total: state.totalPlayers,
        });
      } catch (err) {
        console.error("student:answer failed", err);
      }
    });
  });

  recoverLiveStates()
    .catch((err) => console.error("Failed to recover live sessions on startup", err))
    .finally(() => {
      httpServer.listen(port, () => {
        console.log(
          `> Rahoot ready on http://localhost:${port} (${dev ? "development" : process.env.NODE_ENV})`
        );
      });
    });
});
