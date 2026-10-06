import { createServer } from "node:http";
import next from "next";
import { Server as SocketIOServer, type Socket } from "socket.io";
import { prisma } from "./src/lib/prisma";
import {
  adminSessionCookieName,
  verifySessionEnvelope,
  adminFromEnvelope,
  studentUserFromEnvelope,
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
import { computeHootPoints, isSelectionCorrect, HOOT_QUESTION_SECONDS } from "./src/lib/hootarena/scoring";
import { isStudentEligibleForHootGame, canAdminActOnProgram } from "./src/lib/hootarena/access";
import type {
  HootClientToServerEvents,
  HootServerToClientEvents,
  HootClientQuestion,
  HootRevealPayload,
  HootAdminRevealPayload,
  HootLobbyPlayer,
  HootLeaderboardEntry,
  HootQuestionTypeClient,
} from "./src/lib/hootarena/socket-events";

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

// --- HootArena in-memory game state ---
// Deliberately a completely separate Map/namespace from `liveStates` above -
// HootArena is a fully separate live-game system from legacy LIVE mode (see
// server.ts module comment context), sharing only this file's process and
// the underlying HTTP server, not any room/event/state namespace.
type HootGameState = {
  status: "LOBBY" | "QUESTION" | "REVEAL" | "LEADERBOARD" | "FINISHED";
  questionIndex: number;
  startedAt: number | null;
  answeredUserIds: Set<string>;
  timer: NodeJS.Timeout | null;
  currentQuestionPayload: HootClientQuestion | null;
  // The full admin-shaped breakdown is the one canonical reveal record kept
  // in memory; the slimmer student-facing payload is always derived from it
  // on demand (see toStudentRevealPayload) rather than stored separately -
  // one source of truth, no risk of the two shapes drifting apart.
  lastRevealPayload: HootAdminRevealPayload | null;
  totalPlayers: number;
  // userId -> this namespace's socket.id, for targeted emits and duplicate-
  // session detection. Only ever one entry per userId - a fresh join
  // replaces (and disconnects) any prior socket for that same user.
  playerSockets: Map<string, string>;
  // userId -> the highest join-attempt sequence number that has actually
  // won and registered itself in playerSockets. player:join is async (DB
  // calls before it ever touches playerSockets), so on a rapid double
  // reconnect two overlapping calls can resolve out of order - without
  // this, a slower *older* join finishing after a faster *newer* one would
  // clobber playerSockets with a stale socket.id. Compared against a
  // call's own captured sequence number (see hootJoinCounter) before that
  // call is allowed to write.
  playerJoinSeq: Map<string, number>;
  // Set of this namespace's socket.id values currently registered as host
  // (there can be more than one - e.g. two admin tabs, or a reconnect that
  // hasn't yet been cleaned up by a disconnect event).
  hostSocketIds: Set<string>;
};

const hootStates = new Map<string, HootGameState>();
// Monotonic counter, incremented once per player:join attempt (across every
// game) - cheap, simple, and all that's needed to tell "which of two
// concurrent join calls for the same user actually started later" apart
// from completion order, which async/await gives no guarantee about.
let hootJoinCounter = 0;

function getOrCreateHootState(gameId: string): HootGameState {
  let state = hootStates.get(gameId);
  if (!state) {
    state = {
      status: "LOBBY",
      questionIndex: -1,
      startedAt: null,
      answeredUserIds: new Set(),
      timer: null,
      currentQuestionPayload: null,
      lastRevealPayload: null,
      totalPlayers: 0,
      playerSockets: new Map(),
      playerJoinSeq: new Map(),
      hostSocketIds: new Set(),
    };
    hootStates.set(gameId, state);
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

  // === HootArena ===
  // A separate Socket.IO namespace - its own connection/room/event space,
  // sharing only this HTTP server and process with the LIVE-mode `io` above.
  // Authenticated SkillArena Users only (no anonymous Student rows): every
  // handler re-derives identity/role/program from the signed session cookie
  // plus a live sessionVersion check against the database, never from
  // anything the client claims about itself.
  const hoot = io.of("/hootarena") as unknown as import("socket.io").Namespace<
    HootClientToServerEvents,
    HootServerToClientEvents,
    object,
    { gameId?: string; userId?: string; username?: string; isHost?: boolean }
  >;

  async function verifyHootStudent(socket: Socket): Promise<{ userId: string; username: string } | null> {
    const token = parseCookie(socket.handshake.headers.cookie, adminSessionCookieName());
    const envelope = token ? await verifySessionEnvelope(token) : {};
    const session = studentUserFromEnvelope(envelope);
    if (!session) return null;
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { role: true, sessionVersion: true, username: true },
    });
    if (!user || user.role !== "STUDENT" || user.sessionVersion !== session.sv) return null;
    return { userId: session.userId, username: user.username };
  }

  async function verifyHootAdmin(
    socket: Socket
  ): Promise<{ userId: string; role: "ADMIN" | "SUPER_ADMIN"; programId: string | null } | null> {
    const token = parseCookie(socket.handshake.headers.cookie, adminSessionCookieName());
    const envelope = token ? await verifySessionEnvelope(token) : {};
    const session = adminFromEnvelope(envelope);
    if (!session) return null;
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { role: true, sessionVersion: true, programId: true },
    });
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") || user.sessionVersion !== session.sv) {
      return null;
    }
    return { userId: session.userId, role: user.role, programId: user.programId };
  }

  async function broadcastHootLobby(gameId: string) {
    const state = getOrCreateHootState(gameId);

    // Past LOBBY, nobody's UI renders the player roster anymore, so the
    // full join+broadcast below would be pure waste - but totalPlayers
    // must stay accurate regardless (it drives the zero-players start
    // guard and the reveal screen's unanswered-count math), so still
    // refresh that cheaply. This matters more now than it used to: a
    // reconnect (network blip, tab resume) re-runs player:join, which
    // calls this - a flaky-wifi classroom mid-game would otherwise re-run
    // a full join query and a room-wide broadcast nobody needs on every
    // single reconnect.
    if (state.status !== "LOBBY") {
      state.totalPlayers = await prisma.hootPlayer.count({ where: { gameId } });
      return;
    }

    const players = await prisma.hootPlayer.findMany({
      where: { gameId },
      include: { user: { select: { username: true } } },
      orderBy: { joinedAt: "asc" },
    });
    const list: HootLobbyPlayer[] = players.map((p) => ({ userId: p.userId, username: p.user.username }));
    state.totalPlayers = list.length;
    hoot.to(`hoot:${gameId}`).emit("lobby:update", { players: list });
  }

  async function startHootQuestion(gameId: string, index: number) {
    const state = getOrCreateHootState(gameId);
    if (state.timer) clearTimeout(state.timer);

    const [question, total] = await Promise.all([
      prisma.hootQuestion.findFirst({
        where: { gameId, order: index },
        include: { options: { orderBy: { order: "asc" } } },
      }),
      prisma.hootQuestion.count({ where: { gameId } }),
    ]);
    if (!question) return;

    const payload: HootClientQuestion = {
      questionId: question.id,
      index,
      total,
      type: question.type as HootQuestionTypeClient,
      text: question.text,
      options: question.options.map((o) => ({ id: o.id, text: o.text })),
      startedAt: Date.now(),
      timeLimitSec: HOOT_QUESTION_SECONDS,
    };

    state.status = "QUESTION";
    state.questionIndex = index;
    state.startedAt = payload.startedAt;
    state.answeredUserIds = new Set();
    state.currentQuestionPayload = payload;

    await prisma.hootGame.update({
      where: { id: gameId },
      data: {
        status: "QUESTION",
        currentQuestionIndex: index,
        ...(index === 0 ? { startedAt: new Date() } : {}),
      },
    });

    hoot.to(`hoot:${gameId}`).emit("phase:question", payload);

    state.timer = setTimeout(() => {
      revealHootQuestion(gameId).catch((err) => console.error("HootArena auto-reveal failed", err));
    }, HOOT_QUESTION_SECONDS * 1000 + 500);
  }

  /**
   * The one authoritative reveal computation - used identically whether the
   * host clicks "Reveal answer" or the 20s timer auto-reveals (both funnel
   * through revealHootQuestion, which calls this), so the two paths can
   * never produce different statistics. Counts come straight from the
   * stored HootResponse rows, never from anything the client claims.
   */
  async function buildHootRevealPayload(gameId: string, questionId: string): Promise<HootAdminRevealPayload | null> {
    const question = await prisma.hootQuestion.findUnique({
      where: { id: questionId },
      include: { options: { orderBy: { order: "asc" } } }, // same order students saw them in
    });
    if (!question) return null;

    const responses = await prisma.hootResponse.findMany({ where: { questionId }, select: { selectedOptionIds: true } });
    const counts = new Map<string, number>();
    for (const opt of question.options) counts.set(opt.id, 0);
    for (const r of responses) {
      for (const optId of r.selectedOptionIds) {
        if (counts.has(optId)) counts.set(optId, (counts.get(optId) ?? 0) + 1);
      }
    }

    const answeredCount = responses.length;
    const state = getOrCreateHootState(gameId);
    const totalPlayers = state.totalPlayers;
    // Percentage is of students who answered (matches "75% chose A" reading
    // naturally), not of totalPlayers - a no-show shouldn't dilute every
    // option's percentage down.
    const options = question.options.map((o) => {
      const count = counts.get(o.id) ?? 0;
      const percentage = answeredCount > 0 ? Math.round((count / answeredCount) * 1000) / 10 : 0;
      return { optionId: o.id, text: o.text, count, percentage, isCorrect: o.isCorrect };
    });

    return {
      questionId,
      type: question.type as HootQuestionTypeClient,
      text: question.text,
      options,
      answeredCount,
      unansweredCount: Math.max(0, totalPlayers - answeredCount),
      totalPlayers,
    };
  }

  /** The slim, non-sensitive subset of the reveal payload a student's client ever receives - no per-option counts, no correct-answer flag. */
  function toStudentRevealPayload(admin: HootAdminRevealPayload): HootRevealPayload {
    return { questionId: admin.questionId, answeredCount: admin.answeredCount, totalPlayers: admin.totalPlayers };
  }

  async function revealHootQuestion(gameId: string) {
    const state = hootStates.get(gameId);
    if (!state || state.status !== "QUESTION" || !state.currentQuestionPayload) return;
    if (state.timer) clearTimeout(state.timer);

    // Flip synchronously, before the first await below - the 20s auto-reveal
    // timer and a manual "Reveal answer" click can otherwise both reach this
    // function while state.status still reads "QUESTION" (neither has
    // updated it yet), race each other through the DB round-trip, and both
    // compute/broadcast the reveal. Moving the guard's effect here, ahead of
    // any yield point, makes a concurrent second call see "REVEAL" already
    // and bail out at the check above instead.
    state.status = "REVEAL";

    const payload = await buildHootRevealPayload(gameId, state.currentQuestionPayload.questionId);
    if (!payload) return;

    state.lastRevealPayload = payload;

    await prisma.hootGame.update({ where: { id: gameId }, data: { status: "REVEAL" } });

    // Room-wide slim payload for everyone (including host sockets, who
    // simply don't listen for this event) - then the full per-option
    // distribution targeted at host sockets only. Same split used for
    // leaderboard/finished elsewhere in this file.
    hoot.to(`hoot:${gameId}`).emit("phase:reveal", toStudentRevealPayload(payload));
    for (const hostSocketId of state.hostSocketIds) {
      hoot.to(hostSocketId).emit("phase:reveal:host", payload);
    }
  }

  async function getHootLeaderboard(gameId: string): Promise<HootLeaderboardEntry[]> {
    const players = await prisma.hootPlayer.findMany({
      where: { gameId },
      include: { user: { select: { username: true } } },
    });
    const entries = players.map((p) => ({ userId: p.userId, username: p.user.username, score: p.score }));
    entries.sort((a, b) => b.score - a.score);
    return entries;
  }

  /**
   * Transitions REVEAL -> LEADERBOARD (or, with `final`, just re-sends the
   * FINISHED board without changing status - finishHootGame already moved
   * the status itself). Computes the full board ONCE, then fans it out:
   * the complete ranked list to every host socket, but each player gets
   * ONLY their own score/rank plus the top 3 - never the full board (see
   * spec #18/#46 - students must never see positions 4+).
   */
  async function emitHootLeaderboard(gameId: string, options?: { final?: boolean }) {
    const state = getOrCreateHootState(gameId);
    if (state.timer) clearTimeout(state.timer);

    if (!options?.final) {
      state.status = "LEADERBOARD";
      await prisma.hootGame.update({ where: { id: gameId }, data: { status: "LEADERBOARD" } });
    }

    const leaderboard = await getHootLeaderboard(gameId);
    const top3 = leaderboard.slice(0, 3);
    // Students never receive another player's internal database id - only
    // the host-facing payload below keeps the full HootLeaderboardEntry shape.
    const publicTop3 = top3.map(({ username, score }) => ({ username, score }));
    const eventHost = options?.final ? "finished:host" : "leaderboard:host";
    const eventYou = options?.final ? "finished:you" : "leaderboard:you";

    for (const hostSocketId of state.hostSocketIds) {
      hoot.to(hostSocketId).emit(eventHost, { leaderboard });
    }

    // Points earned THIS round, for the "+N" line on each player's own
    // result screen - looked up from the response they just submitted for
    // the question that was just revealed (0 if they didn't answer).
    const roundPoints = new Map<string, number>();
    const currentQuestionId = state.currentQuestionPayload?.questionId;
    if (currentQuestionId) {
      const [responses, players] = await Promise.all([
        prisma.hootResponse.findMany({
          where: { questionId: currentQuestionId },
          select: { playerId: true, pointsAwarded: true },
        }),
        prisma.hootPlayer.findMany({ where: { gameId }, select: { id: true, userId: true } }),
      ]);
      const playerIdToUserId = new Map(players.map((p) => [p.id, p.userId]));
      for (const r of responses) {
        const userId = playerIdToUserId.get(r.playerId);
        if (userId) roundPoints.set(userId, r.pointsAwarded);
      }
    }

    for (const entry of leaderboard) {
      const socketId = state.playerSockets.get(entry.userId);
      if (!socketId) continue;
      hoot.to(socketId).emit(eventYou, {
        yourScore: entry.score,
        pointsThisRound: roundPoints.get(entry.userId) ?? 0,
        top3: publicTop3,
        youAreInTop3: top3.some((t) => t.userId === entry.userId),
      });
    }
  }

  async function finishHootGame(gameId: string) {
    const state = getOrCreateHootState(gameId);
    if (state.timer) clearTimeout(state.timer);
    state.status = "FINISHED";

    await prisma.hootGame.update({
      where: { id: gameId },
      data: { status: "FINISHED", finishedAt: new Date() },
    });

    await emitHootLeaderboard(gameId, { final: true });
  }

  function sendCurrentHootPhaseTo(
    socket: Socket,
    gameId: string,
    identity: { isHost: true } | { isHost: false; userId: string }
  ) {
    const state = hootStates.get(gameId);
    if (!state) return;
    if (state.status === "QUESTION" && state.currentQuestionPayload) {
      socket.emit("phase:question", state.currentQuestionPayload);
    } else if (state.status === "REVEAL" && state.lastRevealPayload) {
      if (identity.isHost) {
        socket.emit("phase:reveal:host", state.lastRevealPayload);
      } else {
        socket.emit("phase:reveal", toStudentRevealPayload(state.lastRevealPayload));
      }
    }
  }

  // Restores an active game's state to one reconnecting socket - used for
  // both the LOBBY/QUESTION/REVEAL cases (cheap in-memory replay) and the
  // LEADERBOARD/FINISHED cases (needs a fresh per-recipient DB read, since
  // "your score and whether you're in the top 3" is recipient-specific).
  async function restoreHootStateForSocket(
    socket: Socket,
    gameId: string,
    identity: { isHost: true } | { isHost: false; userId: string }
  ) {
    const state = hootStates.get(gameId);
    if (!state) return;

    if (state.status === "QUESTION" || state.status === "REVEAL") {
      sendCurrentHootPhaseTo(socket, gameId, identity);

      // A reconnect mid-QUESTION otherwise looks unanswered to the client,
      // even though the server already has (and will keep) their response -
      // replay their stored result so the UI correctly shows "locked in"
      // instead of re-presenting answerable tiles (spec: reconnect must land
      // back in the right phase, respecting an already-submitted answer).
      if (!identity.isHost && state.status === "QUESTION" && state.currentQuestionPayload) {
        const player = await prisma.hootPlayer.findUnique({
          where: { gameId_userId: { gameId, userId: identity.userId } },
        });
        const response = player
          ? await prisma.hootResponse.findUnique({
              where: { playerId_questionId: { playerId: player.id, questionId: state.currentQuestionPayload.questionId } },
            })
          : null;
        if (response) {
          socket.emit("answer:you", {
            questionId: response.questionId,
            isCorrect: response.isCorrect,
            pointsAwarded: response.pointsAwarded,
          });
        }
      }
      return;
    }
    if (state.status !== "LEADERBOARD" && state.status !== "FINISHED") return;

    const leaderboard = await getHootLeaderboard(gameId);
    if (identity.isHost) {
      socket.emit(state.status === "FINISHED" ? "finished:host" : "leaderboard:host", { leaderboard });
      return;
    }
    const top3 = leaderboard.slice(0, 3);
    const mine = leaderboard.find((e) => e.userId === identity.userId);
    socket.emit(state.status === "FINISHED" ? "finished:you" : "leaderboard:you", {
      yourScore: mine?.score ?? 0,
      pointsThisRound: 0,
      top3: top3.map(({ username, score }) => ({ username, score })),
      youAreInTop3: top3.some((t) => t.userId === identity.userId),
    });
  }

  // Server restart recovery - same rationale as recoverLiveStates() above:
  // rebuilds in-memory state from the persisted HootGame.status /
  // currentQuestionIndex so a game caught mid-flight at restart isn't
  // stranded. A game caught mid-QUESTION can't have its countdown reliably
  // resumed, so it's recovered onto REVEAL for that question instead of a
  // guessed new deadline, using whatever responses were already recorded.
  async function recoverHootStates() {
    const games = await prisma.hootGame.findMany({
      where: { status: { in: ["QUESTION", "REVEAL", "LEADERBOARD"] } },
    });

    for (const game of games) {
      const state = getOrCreateHootState(game.id);
      state.totalPlayers = await prisma.hootPlayer.count({ where: { gameId: game.id } });
      state.questionIndex = game.currentQuestionIndex;

      if (game.status === "LEADERBOARD") {
        state.status = "LEADERBOARD";
        continue;
      }

      const index = game.currentQuestionIndex;
      if (index < 0) continue;
      const question = await prisma.hootQuestion.findFirst({ where: { gameId: game.id, order: index } });
      if (!question) continue;

      const payload = await buildHootRevealPayload(game.id, question.id);
      if (!payload) continue;

      state.status = "REVEAL";
      state.lastRevealPayload = payload;

      if (game.status !== "REVEAL") {
        await prisma.hootGame.update({ where: { id: game.id }, data: { status: "REVEAL" } });
      }
    }

    if (games.length > 0) {
      console.log(`> Recovered ${games.length} in-progress HootArena game(s) from the database`);
    }
  }

  hoot.on("connection", (socket) => {
    socket.on("player:join", async ({ gameId }, ack) => {
      // Captured synchronously, before any await - reflects true call-start
      // order, which is what "newest session wins" actually needs (the
      // awaits below mean two overlapping join calls for the same user can
      // otherwise finish in either order).
      const mySeq = ++hootJoinCounter;
      try {
        const auth = await verifyHootStudent(socket);
        if (!auth) {
          ack(false, "Please log in again.");
          return;
        }

        const game = await prisma.hootGame.findUnique({
          where: { id: gameId },
          select: { id: true, subjectId: true, status: true },
        });
        if (!game) {
          ack(false, "This game no longer exists.");
          return;
        }
        if (game.status === "FINISHED") {
          ack(false, "This game has already ended.");
          return;
        }

        const eligible = await isStudentEligibleForHootGame(auth.userId, game);
        if (!eligible) {
          ack(false, "You're not eligible to join this game.");
          return;
        }

        await prisma.hootPlayer.upsert({
          where: { gameId_userId: { gameId, userId: auth.userId } },
          create: { gameId, userId: auth.userId, score: 0 },
          update: { connected: true },
        });

        const state = getOrCreateHootState(gameId);

        // A newer join (higher sequence number, i.e. started later) for
        // this same user has already won and registered itself while this
        // call was still awaiting the checks above - this call is stale
        // and must not clobber playerSockets with an older socket.id. The
        // socket is still ack'd true (it did validly authenticate), it
        // just doesn't become the registered "current" connection; if it's
        // genuinely a leftover old connection it will be disconnected by
        // the newer join's own kick logic momentarily, if it hasn't been already.
        if ((state.playerJoinSeq.get(auth.userId) ?? 0) > mySeq) {
          ack(true);
          return;
        }
        state.playerJoinSeq.set(auth.userId, mySeq);

        // Duplicate-session handling (spec #23): a fresh join for a userId
        // already connected to this game kicks the old connection first,
        // so there is never more than one live socket per (game, user).
        const previousSocketId = state.playerSockets.get(auth.userId);
        if (previousSocketId && previousSocketId !== socket.id) {
          const previousSocket = hoot.sockets.get(previousSocketId);
          previousSocket?.emit("kicked", { reason: "duplicate-session" });
          previousSocket?.disconnect(true);
        }
        state.playerSockets.set(auth.userId, socket.id);

        socket.data.gameId = gameId;
        socket.data.userId = auth.userId;
        socket.data.username = auth.username;
        socket.data.isHost = false;
        socket.join(`hoot:${gameId}`);

        ack(true);
        await broadcastHootLobby(gameId);
        await restoreHootStateForSocket(socket, gameId, { isHost: false, userId: auth.userId });
      } catch (err) {
        console.error("hootarena player:join failed", err);
        ack(false, "Server error");
      }
    });

    socket.on("host:join", async ({ gameId }, ack) => {
      try {
        const admin = await verifyHootAdmin(socket);
        if (!admin) {
          ack(false, "Please log in again.");
          return;
        }

        const game = await prisma.hootGame.findUnique({
          where: { id: gameId },
          include: { subject: true },
        });
        if (!game) {
          ack(false, "This game no longer exists.");
          return;
        }
        if (!canAdminActOnProgram(admin, game.subject.programId)) {
          ack(false, "Not authorized for this program.");
          return;
        }

        const state = getOrCreateHootState(gameId);
        state.hostSocketIds.add(socket.id);

        socket.data.gameId = gameId;
        socket.data.isHost = true;
        socket.join(`hoot:${gameId}`);

        ack(true);
        await broadcastHootLobby(gameId);
        await restoreHootStateForSocket(socket, gameId, { isHost: true });
      } catch (err) {
        console.error("hootarena host:join failed", err);
        ack(false, "Server error");
      }
    });

    socket.on("host:start", ({ gameId }) => {
      // Must match the specific game this socket authenticated as host for
      // via host:join - `isHost` alone is not enough, or a host legitimately
      // authorized for their own program's game could control an arbitrary
      // OTHER game (including one in a different program) just by sending
      // its gameId instead.
      if (!socket.data.isHost || socket.data.gameId !== gameId) return;
      (async () => {
        const state = hootStates.get(gameId);
        if (!state || state.status !== "LOBBY") return;
        if (state.totalPlayers === 0) return; // spec #13: never start with zero players
        const total = await prisma.hootQuestion.count({ where: { gameId } });
        if (total === 0) return;
        await startHootQuestion(gameId, 0);
      })().catch((err) => console.error("hootarena host:start failed", err));
    });

    socket.on("host:next", ({ gameId }) => {
      if (!socket.data.isHost || socket.data.gameId !== gameId) return;
      (async () => {
        const state = hootStates.get(gameId);
        if (!state) return;
        if (state.status === "QUESTION") {
          await revealHootQuestion(gameId);
        } else if (state.status === "REVEAL") {
          await emitHootLeaderboard(gameId);
        } else if (state.status === "LEADERBOARD") {
          const total = await prisma.hootQuestion.count({ where: { gameId } });
          const nextIndex = state.questionIndex + 1;
          if (nextIndex >= total) {
            await finishHootGame(gameId);
          } else {
            await startHootQuestion(gameId, nextIndex);
          }
        }
      })().catch((err) => console.error("hootarena host:next failed", err));
    });

    socket.on("host:end", ({ gameId }) => {
      if (!socket.data.isHost || socket.data.gameId !== gameId) return;
      finishHootGame(gameId).catch((err) => console.error("hootarena host:end failed", err));
    });

    socket.on("player:answer", ({ gameId, questionId, selectedOptionIds }) => {
      (async () => {
        const userId = socket.data.userId;
        if (!userId || socket.data.gameId !== gameId) return;

        const state = hootStates.get(gameId);
        if (!state || state.status !== "QUESTION" || !state.currentQuestionPayload) return;
        if (state.currentQuestionPayload.questionId !== questionId) return;
        if (state.answeredUserIds.has(userId)) return; // one answer per question - no changes, no resubmits

        // Server-authoritative deadline check, independent of phase - closes
        // the race window where an answer arrives after the timer fired but
        // before revealHootQuestion() finishes flipping the phase (spec #34:
        // never trust a client's own clock for validation).
        const elapsedMs = Date.now() - (state.startedAt ?? Date.now());
        if (elapsedMs > HOOT_QUESTION_SECONDS * 1000 + 500) return;

        const question = await prisma.hootQuestion.findUnique({
          where: { id: questionId },
          include: { options: true },
        });
        if (!question || question.gameId !== gameId) return;

        const player = await prisma.hootPlayer.findUnique({ where: { gameId_userId: { gameId, userId } } });
        if (!player) return;

        const validIds = new Set(question.options.map((o) => o.id));
        const cleanSelection = [...new Set(selectedOptionIds)].filter((id) => validIds.has(id));

        const correctOptionIds = question.options.filter((o) => o.isCorrect).map((o) => o.id);
        const isCorrect = isSelectionCorrect(cleanSelection, correctOptionIds);
        const pointsAwarded = computeHootPoints({ isCorrect, elapsedMs });

        // Mark as answered BEFORE the await below, so a second burst of
        // events for the same question (e.g. a flaky double-emit from the
        // client) can't slip past the in-memory check while this write is
        // still in flight; the @@unique on (playerId, questionId) is the
        // final backstop if it somehow still did.
        state.answeredUserIds.add(userId);

        await prisma.$transaction([
          prisma.hootResponse.create({
            data: { gameId, questionId, playerId: player.id, selectedOptionIds: cleanSelection, isCorrect, pointsAwarded },
          }),
          prisma.hootPlayer.update({ where: { id: player.id }, data: { score: { increment: pointsAwarded } } }),
        ]);

        socket.emit("answer:you", { questionId, isCorrect, pointsAwarded });
        hoot.to(`hoot:${gameId}`).emit("answer:count", {
          answered: state.answeredUserIds.size,
          total: state.totalPlayers,
        });
      })().catch((err) => console.error("hootarena player:answer failed", err));
    });

    socket.on("disconnect", () => {
      const { gameId, userId, isHost } = socket.data;
      if (!gameId) return;
      const state = hootStates.get(gameId);
      if (!state) return;

      if (isHost) {
        state.hostSocketIds.delete(socket.id);
        // Host disconnect never tears down game state (spec #25) - it just
        // sits as-is until some host socket reconnects via host:join.
      } else if (userId && state.playerSockets.get(userId) === socket.id) {
        state.playerSockets.delete(userId);
        prisma.hootPlayer.updateMany({ where: { gameId, userId }, data: { connected: false } }).catch(() => {});
        broadcastHootLobby(gameId).catch(() => {});
      }
    });
  });

  Promise.all([
    recoverLiveStates().catch((err) => console.error("Failed to recover live sessions on startup", err)),
    recoverHootStates().catch((err) => console.error("Failed to recover HootArena sessions on startup", err)),
  ]).finally(() => {
    httpServer.listen(port, () => {
      console.log(
        `> Rahoot ready on http://localhost:${port} (${dev ? "development" : process.env.NODE_ENV})`
      );
    });
  });
});
