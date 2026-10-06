// Shared Socket.IO event contracts for HootArena's dedicated `/hootarena`
// namespace - a separate connection/room-space from the legacy LIVE-mode
// socket events in `@/lib/socket-events`, so the two systems can never
// collide on event names or room membership. Kept in one file so
// server.ts and the client components never drift apart.

export type HootQuestionTypeClient = "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE";

export type HootLobbyPlayer = {
  userId: string;
  username: string;
};

export type HootClientOption = {
  id: string;
  text: string;
};

export type HootClientQuestion = {
  questionId: string;
  index: number;
  total: number;
  type: HootQuestionTypeClient;
  text: string;
  options: HootClientOption[];
  startedAt: number; // ms epoch - client computes its own countdown from this, server owns the real deadline
  timeLimitSec: number;
};

/** Sent room-wide, including to students - deliberately minimal: just enough to flip into the REVEAL phase and show the generic "X/Y answered" line. Never the correct answer or any per-option breakdown - see HootAdminRevealPayload for that. */
export type HootRevealPayload = {
  questionId: string;
  answeredCount: number;
  totalPlayers: number;
};

/** One option's aggregate stats for the host's reveal screen - counts/percentage only, never which specific student picked it. */
export type HootOptionStat = {
  optionId: string;
  text: string;
  count: number;
  percentage: number; // 0-100, rounded to 1 decimal; of answeredCount, not totalPlayers
  isCorrect: boolean;
};

/** Host-only - the full answer-distribution breakdown. Never sent to students (see spec: "what did the students think the answer was" is an admin-only view). */
export type HootAdminRevealPayload = {
  questionId: string;
  type: HootQuestionTypeClient;
  text: string;
  options: HootOptionStat[];
  answeredCount: number;
  unansweredCount: number;
  totalPlayers: number;
};

export type HootLeaderboardEntry = {
  userId: string;
  username: string;
  score: number;
};

/** Sent only to the host - the full, ranked board. */
export type HootHostLeaderboardPayload = {
  leaderboard: HootLeaderboardEntry[];
};

/** Only what a student is ever allowed to see about another player - never their internal database id. */
export type HootPublicLeaderboardEntry = {
  username: string;
  score: number;
};

/** Sent individually to each player - never the full board, only their own standing plus the top 3 (see spec: students must not see positions 4+ or any other player's internal id). */
export type HootYourLeaderboardPayload = {
  yourScore: number;
  pointsThisRound: number;
  top3: HootPublicLeaderboardEntry[];
  youAreInTop3: boolean;
};

export type HootYourAnswerResultPayload = {
  questionId: string;
  isCorrect: boolean;
  pointsAwarded: number;
};

/** Emitted to an old connection when the same user joins the same game from elsewhere (see spec #23). */
export type HootKickedPayload = {
  reason: "duplicate-session" | "game-finished" | "removed";
};

/** Events the server emits, scoped to the `hoot:{gameId}` room unless noted as targeted at one socket. */
export interface HootServerToClientEvents {
  "lobby:update": (payload: { players: HootLobbyPlayer[] }) => void;
  "phase:question": (payload: HootClientQuestion) => void;
  "phase:reveal": (payload: HootRevealPayload) => void;
  "phase:reveal:host": (payload: HootAdminRevealPayload) => void; // targeted at host sockets only - the full per-option distribution
  "leaderboard:host": (payload: HootHostLeaderboardPayload) => void; // targeted at host sockets only
  "leaderboard:you": (payload: HootYourLeaderboardPayload) => void; // targeted at one player's socket
  "finished:host": (payload: HootHostLeaderboardPayload) => void; // targeted at host sockets only
  "finished:you": (payload: HootYourLeaderboardPayload) => void; // targeted at one player's socket
  "answer:you": (payload: HootYourAnswerResultPayload) => void; // targeted at one player's socket
  "answer:count": (payload: { answered: number; total: number }) => void;
  "kicked": (payload: HootKickedPayload) => void; // targeted - this connection has been superseded/removed
  "error": (payload: { message: string }) => void;
}

/** Events clients emit to the server. */
export interface HootClientToServerEvents {
  "player:join": (payload: { gameId: string }, ack: (ok: boolean, error?: string) => void) => void;
  "host:join": (payload: { gameId: string }, ack: (ok: boolean, error?: string) => void) => void;
  "host:start": (payload: { gameId: string }) => void;
  "host:next": (payload: { gameId: string }) => void;
  "host:end": (payload: { gameId: string }) => void;
  "player:answer": (payload: {
    gameId: string;
    questionId: string;
    selectedOptionIds: string[];
  }) => void;
}
