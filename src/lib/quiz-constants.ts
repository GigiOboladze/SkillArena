// SkillArena QUIZ-mode rules - fixed for every quiz, not admin-configurable.
// No "server-only" here (unlike quiz.ts) - client components need these too
// (e.g. to render "x / 3" tab-switch counters), so this file must stay free
// of server-only imports like prisma.
export const QUIZ_QUESTION_POINTS = 1;
export const QUIZ_QUESTION_TIME_LIMIT_SEC = 100;
export const QUIZ_MAX_TAB_SWITCHES = 2; // 3rd detected switch fails the quiz
export const QUIZ_TAB_SWITCH_FAILURE_REASON = "Excessive tab switching";
