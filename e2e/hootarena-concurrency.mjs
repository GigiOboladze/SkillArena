// Concurrency / load test for HootArena's real-time engine at 1, 5, 10, 20
// and 50 simultaneous players.
//
// Drives Socket.IO directly instead of through browsers: 50 Chromium pages is
// not realistic on one dev machine, but 50 real websocket clients is, and the
// socket layer is exactly what the concurrency risk lives in (shared in-memory
// game state, the answered-set guard, the per-question unique constraint, and
// the host's answer counter).
//
// Each level runs its own fresh game so the levels cannot interfere. Players
// are created as HootPlayer rows directly (the join server action is a
// browser-only path; the socket handshake it produces is reproduced exactly:
// player:join carries (gameId, playerId, clientToken), which is the real
// credential the server verifies).
//
// The host session is a genuine signed session envelope minted with the app's
// own session-core helpers, so host:join goes through the real
// verifyHootAdmin path including the live sessionVersion check.
//
// Run: npm run test:e2e:hootarena-concurrency
import "dotenv/config";
import { io } from "socket.io-client";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { signSessionEnvelope, newAdminEntry, sessionCookieName } from "../src/lib/session-core.ts";
import { computeHootPoints, HOOT_QUESTION_SECONDS } from "../src/lib/hootarena/scoring.ts";

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const LEVELS = (process.env.HOOT_LEVELS || "1,5,10,20,50").split(",").map((n) => Number(n.trim()));

const results = [];
function ok(name) { results.push({ name, pass: true }); console.log("PASS:", name); }
function fail(name, err) { results.push({ name, pass: false, err: String(err) }); console.log("FAIL:", name, "-", err); }
async function assert(cond, message) { if (!cond) throw new Error(message); }

const prisma = new PrismaClient();
const RUN_ID = Date.now();
const createdGameIds = [];
const timings = [];

function connect(namespaceUrl, opts = {}) {
  return new Promise((resolve, reject) => {
    const socket = io(namespaceUrl, { path: "/socket.io", transports: ["websocket"], forceNew: true, ...opts });
    const timer = setTimeout(() => reject(new Error("socket connect timeout")), 20000);
    socket.on("connect", () => { clearTimeout(timer); resolve(socket); });
    socket.on("connect_error", (e) => { clearTimeout(timer); reject(e); });
  });
}

function emitWithAck(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, (okFlag, err) => resolve({ okFlag, err })));
}

async function runLevel(playerCount, hostCookie, superAdmin) {
  const label = `${playerCount} player${playerCount === 1 ? "" : "s"}`;

  // ---- fixture: a fresh game with exactly one question ----
  const game = await prisma.hootGame.create({
    data: {
      title: `E2E CONC ${playerCount} ${RUN_ID}`,
      pin: String(100000 + Math.floor(Math.random() * 899999)),
      hostId: superAdmin.id,
      questions: {
        create: [{
          order: 0,
          type: "SINGLE_CHOICE",
          text: `Concurrency question (${playerCount})`,
          options: { create: [
            { text: "correct", isCorrect: true, order: 0 },
            { text: "wrong", isCorrect: false, order: 1 },
          ] },
        }],
      },
    },
    include: { questions: { include: { options: true } } },
  });
  createdGameIds.push(game.id);
  const question = game.questions[0];
  const correctOption = question.options.find((o) => o.isCorrect);
  const wrongOption = question.options.find((o) => !o.isCorrect);

  const players = [];
  for (let i = 0; i < playerCount; i++) {
    players.push(await prisma.hootPlayer.create({
      data: { gameId: game.id, username: `p${i}-${RUN_ID}`, clientToken: `tok-${i}-${RUN_ID}-${Math.random().toString(36).slice(2)}` },
    }));
  }

  // ---- host connects ----
  const host = await connect(`${BASE}/hootarena`, { extraHeaders: { Cookie: hostCookie } });
  const hostJoin = await emitWithAck(host, "host:join", { gameId: game.id });
  await assert(hostJoin.okFlag === true, `host:join failed at ${label}: ${hostJoin.err}`);

  // Track what the host observes, to check the server's own counter.
  let lastAnswerCount = null;
  let revealPayload = null;
  host.on("answer:count", (p) => { lastAnswerCount = p; });
  host.on("phase:reveal:host", (p) => { revealPayload = p; });

  // ---- all players connect and join simultaneously ----
  const connectStart = Date.now();
  const sockets = await Promise.all(players.map(() => connect(`${BASE}/hootarena`)));
  const joinAcks = await Promise.all(
    sockets.map((s, i) => emitWithAck(s, "player:join", {
      gameId: game.id, playerId: players[i].id, clientToken: players[i].clientToken,
    }))
  );
  const connectMs = Date.now() - connectStart;
  const failedJoins = joinAcks.filter((a) => a.okFlag !== true);
  await assert(failedJoins.length === 0, `${failedJoins.length}/${playerCount} joins failed at ${label}: ${failedJoins[0]?.err}`);

  // Each player records its own result, so we can verify per-player scoring.
  const myResults = new Map();
  sockets.forEach((s, i) => s.on("answer:you", (p) => myResults.set(i, p)));

  // Wait for the server to register everyone in its in-memory state.
  await new Promise((r) => setTimeout(r, Math.max(600, playerCount * 12)));

  // ---- host starts the round ----
  const questionSeen = Promise.all(sockets.map((s) => new Promise((resolve) => s.once("phase:question", resolve))));
  host.emit("host:start", { gameId: game.id });
  const startedAt = Date.now();
  await Promise.race([questionSeen, new Promise((_, rej) => setTimeout(() => rej(new Error("phase:question not delivered to all players")), 20000))]);
  const broadcastMs = Date.now() - startedAt;

  // ---- everyone answers at once (half correct, half wrong) ----
  const answerStart = Date.now();
  sockets.forEach((s, i) => {
    const pick = i % 2 === 0 ? correctOption.id : wrongOption.id;
    s.emit("player:answer", { gameId: game.id, questionId: question.id, selectedOptionIds: [pick] });
  });
  // Wait until every player has its own result back, or time out.
  const deadline = Date.now() + 20000;
  while (myResults.size < playerCount && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
  const answerMs = Date.now() - answerStart;
  await assert(myResults.size === playerCount, `only ${myResults.size}/${playerCount} players got answer:you at ${label}`);

  // ---- verify persistence and scoring ----
  const responses = await prisma.hootResponse.findMany({ where: { questionId: question.id } });
  await assert(responses.length === playerCount, `expected ${playerCount} stored responses at ${label}, got ${responses.length}`);
  const distinctPlayers = new Set(responses.map((r) => r.playerId)).size;
  await assert(distinctPlayers === playerCount, `duplicate responses detected at ${label} (${distinctPlayers} distinct of ${responses.length})`);

  const expectedCorrect = Math.ceil(playerCount / 2);
  const actualCorrect = responses.filter((r) => r.isCorrect).length;
  await assert(actualCorrect === expectedCorrect, `expected ${expectedCorrect} correct at ${label}, got ${actualCorrect}`);

  // Every correct answer must be inside the documented [50%, 100%] band, and
  // every wrong one exactly 0 - i.e. server-side scoring held under load.
  const maxPoints = computeHootPoints({ isCorrect: true, elapsedMs: 0 });
  const minPoints = computeHootPoints({ isCorrect: true, elapsedMs: HOOT_QUESTION_SECONDS * 1000 });
  for (const r of responses) {
    if (r.isCorrect) {
      await assert(
        r.pointsAwarded >= minPoints && r.pointsAwarded <= maxPoints,
        `correct answer scored ${r.pointsAwarded}, outside [${minPoints},${maxPoints}] at ${label}`
      );
    } else {
      await assert(r.pointsAwarded === 0, `incorrect answer scored ${r.pointsAwarded} at ${label}`);
    }
  }

  // Stored player scores must equal their own response's points.
  const refreshed = await prisma.hootPlayer.findMany({ where: { gameId: game.id }, select: { id: true, score: true } });
  const pointsByPlayer = new Map(responses.map((r) => [r.playerId, r.pointsAwarded]));
  for (const p of refreshed) {
    await assert(
      p.score === (pointsByPlayer.get(p.id) ?? 0),
      `player score ${p.score} != awarded ${pointsByPlayer.get(p.id)} at ${label}`
    );
  }

  // The host's live counter must have converged on the true total.
  await assert(
    lastAnswerCount && lastAnswerCount.answered === playerCount && lastAnswerCount.total === playerCount,
    `host counter wrong at ${label}: ${JSON.stringify(lastAnswerCount)}`
  );

  // ---- reveal, and check the host's distribution adds up ----
  host.emit("host:next", { gameId: game.id });
  const revealDeadline = Date.now() + 15000;
  while (!revealPayload && Date.now() < revealDeadline) await new Promise((r) => setTimeout(r, 100));
  await assert(!!revealPayload, `host never received phase:reveal:host at ${label}`);
  await assert(
    revealPayload.answeredCount === playerCount && revealPayload.totalPlayers === playerCount,
    `reveal counts wrong at ${label}: ${JSON.stringify({ a: revealPayload.answeredCount, t: revealPayload.totalPlayers })}`
  );
  const summed = revealPayload.options.reduce((s, o) => s + o.count, 0);
  await assert(summed === playerCount, `reveal option counts sum to ${summed}, expected ${playerCount} at ${label}`);
  await assert(revealPayload.unansweredCount === 0, `unansweredCount should be 0 at ${label}, got ${revealPayload.unansweredCount}`);

  host.emit("host:end", { gameId: game.id });
  await new Promise((r) => setTimeout(r, 400));

  timings.push({ playerCount, connectMs, broadcastMs, answerMs });
  ok(`${label}: all joined, all answered once, scores + counters + reveal all consistent (connect ${connectMs}ms, broadcast ${broadcastMs}ms, answers ${answerMs}ms)`);

  for (const s of sockets) s.close();
  host.close();
}

async function run() {
  const superAdmin = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" }, select: { id: true, username: true, sessionVersion: true } });
  if (!superAdmin) throw new Error("no SUPER_ADMIN in the database - run the seed first");

  const token = await signSessionEnvelope({ admin: newAdminEntry(superAdmin.id, superAdmin.username, superAdmin.sessionVersion) });
  const hostCookie = `${sessionCookieName()}=${token}`;
  ok("minted a real signed host session (host:join goes through verifyHootAdmin)");

  for (const level of LEVELS) {
    await runLevel(level, hostCookie, superAdmin);
  }

  // ---- independence: two games running at once must not interfere ----
  const a = await prisma.hootGame.create({
    data: {
      title: `E2E CONC IND-A ${RUN_ID}`, pin: String(100000 + Math.floor(Math.random() * 899999)), hostId: superAdmin.id,
      questions: { create: [{ order: 0, type: "SINGLE_CHOICE", text: "A?", options: { create: [{ text: "y", isCorrect: true, order: 0 }, { text: "n", isCorrect: false, order: 1 }] } }] },
    },
    include: { questions: { include: { options: true } } },
  });
  const b = await prisma.hootGame.create({
    data: {
      title: `E2E CONC IND-B ${RUN_ID}`, pin: String(100000 + Math.floor(Math.random() * 899999)), hostId: superAdmin.id,
      questions: { create: [{ order: 0, type: "SINGLE_CHOICE", text: "B?", options: { create: [{ text: "y", isCorrect: true, order: 0 }, { text: "n", isCorrect: false, order: 1 }] } }] },
    },
    include: { questions: { include: { options: true } } },
  });
  createdGameIds.push(a.id, b.id);

  const pa = await prisma.hootPlayer.create({ data: { gameId: a.id, username: `ia-${RUN_ID}`, clientToken: `ta-${RUN_ID}` } });
  const pb = await prisma.hootPlayer.create({ data: { gameId: b.id, username: `ib-${RUN_ID}`, clientToken: `tb-${RUN_ID}` } });

  const hostA = await connect(`${BASE}/hootarena`, { extraHeaders: { Cookie: hostCookie } });
  const hostB = await connect(`${BASE}/hootarena`, { extraHeaders: { Cookie: hostCookie } });
  await emitWithAck(hostA, "host:join", { gameId: a.id });
  await emitWithAck(hostB, "host:join", { gameId: b.id });
  const sa = await connect(`${BASE}/hootarena`);
  const sb = await connect(`${BASE}/hootarena`);
  await emitWithAck(sa, "player:join", { gameId: a.id, playerId: pa.id, clientToken: pa.clientToken });
  await emitWithAck(sb, "player:join", { gameId: b.id, playerId: pb.id, clientToken: pb.clientToken });

  let bSawQuestion = false;
  sb.on("phase:question", () => { bSawQuestion = true; });
  const aSaw = new Promise((resolve) => sa.once("phase:question", resolve));
  await new Promise((r) => setTimeout(r, 500));
  hostA.emit("host:start", { gameId: a.id });
  await Promise.race([aSaw, new Promise((_, rej) => setTimeout(() => rej(new Error("game A never started")), 15000))]);
  await new Promise((r) => setTimeout(r, 800));
  await assert(!bSawQuestion, "starting game A must not push a question into game B");
  const bStatus = await prisma.hootGame.findUnique({ where: { id: b.id }, select: { status: true } });
  await assert(bStatus.status === "LOBBY", `game B should still be in LOBBY, got ${bStatus.status}`);
  ok("two concurrent games stay fully independent (no cross-room leakage)");

  hostA.emit("host:end", { gameId: a.id });
  await new Promise((r) => setTimeout(r, 400));
  for (const s of [sa, sb, hostA, hostB]) s.close();

  console.log("\n  players | connect+join | start broadcast | all answers");
  console.log("  --------+--------------+-----------------+------------");
  for (const t of timings) {
    console.log(`  ${String(t.playerCount).padStart(7)} | ${String(t.connectMs + "ms").padStart(12)} | ${String(t.broadcastMs + "ms").padStart(15)} | ${String(t.answerMs + "ms").padStart(11)}`);
  }
}

try {
  await run();
} catch (err) {
  fail("suite aborted", err?.stack || err);
} finally {
  try {
    for (const id of createdGameIds) await prisma.hootGame.delete({ where: { id } }).catch(() => {});
    console.log(`\nCleaned up ${createdGameIds.length} game(s).`);
  } catch (err) { console.log("cleanup warning:", err?.message ?? err); }
  await prisma.$disconnect().catch(() => {});

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("FAILURES:");
    for (const f of failed) console.log(" -", f.name, "::", f.err);
    process.exitCode = 1;
  }
}
