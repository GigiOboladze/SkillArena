# React Implementation Guide

How React is *actually* used in SkillArena. Every example is real code from this repo, with the reasoning
and the consequence of doing it differently. React 19.2.8 on Next.js 16 App Router.

## The headline fact: this is a server-first codebase

28 client modules out of ~90 React files. Everything else is an async Server Component that queries Prisma
directly and ships zero JavaScript for its data layer. **There is no Redux, no Zustand, and — verified by
grep — zero `createContext` / `useContext` in the entire project.**

That absence is the most interesting architectural statement in the codebase, and it is worth being able
to explain in an exam: the classic reason to reach for Context is "many components need the current user /
the current theme / the fetched data". Here:
- **current user** — every page is server-rendered and calls `getCurrentStudent()` itself, so there is no
  prop-drilling to avoid;
- **theme** — kept in the DOM (`html[data-theme]`) and `localStorage`, not in React state;
- **fetched data** — fetched per-page on the server.

Context is not missing by neglect; the architecture removed the need for it.

---

## 1. Server Components as the default data layer

**File:** `src/app/dashboard/page.tsx`

```tsx
export default async function StudentDashboardPage() {
  const student = await getCurrentStudent();
  if (!student) redirect("/login");

  const eligibleWhere = await eligibleHomeworkWhere(student.id);
  const [program, publishedQuizzes, attempts, leaderboard, ungroupedSubjects] = await Promise.all([
    prisma.program.findUnique({ where: { id: student.programId } }),
    prisma.homework.findMany({ where: { mode: "QUIZ", status: "OPEN", ...eligibleWhere }, /* … */ }),
    prisma.quizAttempt.findMany({ where: { studentId: student.id }, /* … */ }),
    getCumulativeLeaderboard(student.programId),
    getUngroupedSubjectAssignments(student.id),
  ]);
```

**What it does:** an `async` component awaits five queries in parallel, then renders.
**Why:** no `useEffect` + `fetch`, no loading state, no client-side waterfall, no API route. The database
credentials never approach the browser, and the eligibility rule is applied in SQL.
**If done differently:** the classic `useEffect(() => { fetch('/api/dashboard') }, [])` would need an API
route, a loading state, an error state, a serialisation layer, and would leak the eligibility rule to a
client-callable endpoint. It would also flash empty content on every visit.
**Note the `Promise.all`** — this is the thing to point out in an exam. Awaiting the five sequentially
would serialise five round trips.

---

## 2. `useState` — and where it is deliberately *not* used

Client state exists only for things the server genuinely cannot know. `HootPlayClient` holds 11 pieces:

```tsx
// src/app/hootarena/play/[id]/HootPlayClient.tsx:30-40
const [phase, setPhase] = useState<Phase>("connecting");
const [question, setQuestion] = useState<HootClientQuestion | null>(null);
const [hasAnswered, setHasAnswered] = useState(false);
const [selectedIds, setSelectedIds] = useState<string[]>([]);
const [timeLeft, setTimeLeft] = useState(0);
// …
```

**Why here:** this state is pushed by WebSocket events. No server render can know that question 3 just
started.

**The contrast worth citing:** the SkillArena quiz question page (`quiz/[id]/q/[index]/page.tsx`) renders
the *same kind of UI* — options, selected state, a timer — with **no `useState` at all**. The selected
option comes from `attemptAnswer.selectedOptionId` in the database, each tile is a `<form>` posting a
Server Action, and `revalidatePath` re-renders the page. Two solutions to one problem, chosen by whether
the state must survive a refresh.

### Functional updates
```tsx
// HootPlayClient.tsx:139
setSelectedIds((prev) => prev.includes(optionId) ? prev.filter(id => id !== optionId) : [...prev, optionId]);
```
Uses the updater form because the next value depends on the previous one, and returns a **new array**
rather than mutating. `prev.push(optionId)` would mutate the existing array — same reference, so React
would not re-render.

```tsx
// HootPlayClient.tsx:61
setPhase((p) => (p === "connecting" ? "lobby" : p));
```
Subtle and worth understanding: the join `ack` can arrive *after* the server already pushed
`phase:question`. Writing `setPhase("lobby")` unconditionally would drag a live player back to the lobby.
The updater reads the latest state and only advances out of `"connecting"`.

---

## 3. `useEffect` — subscriptions, the legitimate use case

**File:** `src/app/hootarena/play/[id]/HootPlayClient.tsx:42-116`

```tsx
useEffect(() => {
  const socket = getHootSocket();

  const join = () => {
    socket.emit("player:join", { gameId, playerId, clientToken }, (ok, err) => { /* … */ });
  };

  if (socket.connected) join();
  socket.on("connect", join);                 // ← re-join on EVERY reconnect

  const onQuestion = (q: HootClientQuestion) => { setQuestion(q); setPhase("question"); /* … */ };
  socket.on("phase:question", onQuestion);
  // … 6 more listeners

  return () => {                               // ← cleanup: remove every listener
    socket.off("connect", join);
    socket.off("phase:question", onQuestion);
    // … 6 more
  };
}, [gameId, playerId, clientToken]);
```

**Why each part matters:**
- **Named handlers, not inline arrows.** `socket.off("phase:question", onQuestion)` can only remove a
  listener it can identify. `socket.on("phase:question", q => …)` would be unremovable, and every
  remount would stack another listener — the classic duplicate-event bug, where one incoming event fires
  five `setState` calls.
- **`if (socket.connected) join()` *and* `socket.on("connect", join)`.** The socket is a module-level
  singleton, so on a second mount it is already connected and `"connect"` will never fire again — hence the
  imperative call. And registering on `"connect"` handles transparent reconnects after a network blip.
- **The dependency array** is the real identity of this subscription. If `gameId` changes, the effect tears
  down and re-subscribes to the right room.

**This is also the location of a real bug worth studying by contrast.** The legacy
`src/app/play/[homeworkId]/LiveGame.tsx:45` emits `lobby:join` **once, inline in the effect body**, with no
`socket.on("connect", …)`. After a network blip socket.io reconnects with a brand-new socket that the
server has not placed in any room, so the client looks connected and silently receives nothing forever.
The HootArena version carries a 12-line comment explaining precisely this; the legacy one was never fixed.

### The derived-timer effect
```tsx
// HootPlayClient.tsx:118-127
useEffect(() => {
  if (phase !== "question" || !question) return;     // guard first
  const tick = () => {
    const elapsed = (Date.now() - question.startedAt) / 1000;
    setTimeLeft(Math.max(0, Math.ceil(question.timeLimitSec - elapsed)));
  };
  tick();                                            // run immediately, don't wait 250 ms
  const interval = setInterval(tick, 250);
  return () => clearInterval(interval);
}, [phase, question]);
```
Each tick recomputes from the **server-supplied `question.startedAt`** rather than decrementing a counter.
Decrementing would drift whenever the tab is throttled or backgrounded; recomputing from an absolute
timestamp is self-correcting. The cleanup prevents the interval leaking across questions.

### `useEffect` misuse that ESLint actually flags
`npx eslint` reports **4 `react-hooks/set-state-in-effect` errors**:

```tsx
// src/components/TabSwitchMonitor.tsx:36-38
useEffect(() => { setCount(initialCount); }, [initialCount]);   // ← flagged
```
This is the "sync state from a prop" anti-pattern. It works, but it renders once with the stale value and
then again with the new one. The modern alternatives are a `key` prop to remount, or deriving the value
during render. Same pattern in `QuizTimer.tsx:24`, `ThemeToggle.tsx:19`, `CountUp.tsx:15`. These are the
clearest "what would you change?" answers in the codebase.

---

## 4. `useRef` — three genuinely different purposes

**(a) A latch that must not trigger a re-render.**
```tsx
// src/components/TabSwitchMonitor.tsx:33-34, 42-43
const awayRef = useRef(false);
const failedRef = useRef(false);

async function reportDeparture() {
  if (awayRef.current || failedRef.current) return;
  awayRef.current = true;
  const result = await reportTabSwitch(quizId);
  // …
}
```
One alt-tab fires **both** `blur` and `visibilitychange`. The latch de-duplicates them into a single
reported departure. `useState` would be wrong twice over: it would re-render for a value nothing displays,
and — critically — `setState` is asynchronous, so two events in the same tick would both read `false` and
both report. A ref mutates synchronously, which is exactly the required semantics.

**(b) Guarding a one-shot navigation.**
```tsx
// src/app/quiz/[id]/q/[index]/QuestionClientControls.tsx:23-30
const navigatedRef = useRef(false);
const goNext = useCallback(() => {
  if (navigatedRef.current) return;
  navigatedRef.current = true;
  router.push(nextHref);
  router.refresh();
}, [router, nextHref]);
```
Stops a double `router.push` if the timer's `onExpire` fires twice during the transition.

**(c) A real DOM handle.**
```tsx
// src/app/dashboard/bug-reports/new/BugReportScreenshotInput.tsx:21-23
const dt = new DataTransfer();
files.forEach((f) => dt.items.add(f));
if (inputRef.current) inputRef.current.files = dt.files;
```
Rebuilding a `FileList` is impossible declaratively — `input.files` must be assigned imperatively. A
legitimate escape hatch. (Note `AsyncOptions.tsx` uses a ref for the same reason: to reach
`closest("form")?.requestSubmit()`.)

---

## 5. `useCallback` — used once, correctly

Only `QuestionClientControls` uses it, for `goNext`/`goToResult`. The reason is real rather than cargo-cult:
`goNext` is passed to `QuizTimer` as `onExpire`, and `QuizTimer`'s own effect depends on `seconds`. A fresh
function identity each render is harmless here only because `onExpire` is deliberately excluded from that
effect's deps (with an `eslint-disable`); `useCallback` keeps the reference stable anyway.

**`useMemo` is used nowhere in the project.** That is the correct call — the derived values are
`entries.slice(0, 3)`, `new Set(currentGroupIds)`, `new Map(answers.map(…))` on lists of tens of items.
Memoising those would cost more than it saves. If asked "where would you add `useMemo`?", the honest answer
for this codebase is "nowhere yet" — and knowing *why* is the better answer.

---

## 6. `useActionState` — React 19 forms

**File:** `src/app/dashboard/inco/IncoForm.tsx`

```tsx
const [state, formAction, pending] = useActionState(submitIncoMessage, initialState);

if (state.code) { return <SuccessScreen code={state.code} />; }

return (
  <form action={formAction} className="…">
    <select name="category" required defaultValue="">…</select>
    <textarea name="message" required maxLength={MAX_INCO_MESSAGE_LENGTH} />
    {state.error && <p className="text-sm font-medium text-rahoot-red">{state.error}</p>}
    <button type="submit" disabled={pending}>{pending ? "იგზავნება..." : "გაგზავნა ანონიმურად"}</button>
  </form>
);
```

The three-tuple is the whole point: `state` is whatever the action returned, `formAction` goes straight to
`<form action>`, and `pending` gives a free submitting state with no manual `useState(false)` /
`try/finally`. The server action's signature is `(prevState, formData) => newState`, typed as
`SubmitIncoState`.

**Why this form uses it but most do not:** it needs to render a *returned value* (the one-time reference
code) and inline validation messages. The other forms simply `redirect()` with a `?error=` param, so they
need no client state at all. `StatusCheckForm` uses the same hook for the same reason.

---

## 7. Controlled vs uncontrolled — a deliberate split

**Uncontrolled (the default here).** Admin forms use `defaultValue` + `name` and let the Server Action read
`FormData`:
```tsx
// QuizQuestionForm.tsx
<textarea name="text" required maxLength={500} defaultValue={defaults?.text} />
<input type="radio" name="correct" value={i} defaultChecked={defaults?.correctIndex === i} />
```
No state, no re-render per keystroke, and it works before hydration.

**Controlled, where a value must drive *other* UI:**
```tsx
// QuizTargetingForm.tsx:22-42
const [subjectId, setSubjectId] = useState(currentSubjectId ?? subjects[0]?.id ?? "");
const selectedSubject = subjects.find((s) => s.id === subjectId);
<select name="subjectId" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
```
The checkbox list below must change when the subject changes, so the select must be controlled.
`HootQuestionForm` does the same with `type` (radio vs checkbox) and `optionCount`.

**And the third way — no JavaScript at all.** The legacy `QuestionForm` solves the identical
"show/hide depending on a radio" problem in pure CSS:
```css
/* globals.css:214 */
.question-form:has(input[name="type"][value="PARAGRAPH"]:checked) [data-mc-only] { display: none; }
```
Three approaches to conditional UI in one codebase — a very good thing to be able to compare.

---

## 8. Lists and keys

Keys are stable database ids throughout: `key={opt.id}`, `key={q.id}`, `key={e.studentId}`,
`key={report.id}`. Two considered exceptions:

```tsx
// HootLeaderboard.tsx:44 — students never receive another player's internal id,
// so the (unique) username is the only stable key available
{top3.map((e, i) => <li key={e.username}>…</li>)}

// BugReportScreenshotInput.tsx:46 — blob URL is unique per selected file
{previews.map((src, i) => <img key={src} … />)}
```

Index keys appear only where the list is a fixed-length literal (`[1,2,3,4].map(i => <label key={i}>)`),
which is safe because the list can never reorder. The HootTop3 case is the interesting one: the *privacy*
decision (don't send ids to students) determined the *key* choice.

---

## 9. Conditional rendering — the phase-machine pattern

Both real-time clients render a state machine as a sequence of early returns:
```tsx
if (error)                  return <Centered>…</Centered>;
if (phase === "kicked")     return …;
if (phase === "connecting") return …;
if (phase === "lobby")      return …;
if (phase === "question" && question) return …;
if (phase === "reveal" && reveal)     return …;
if ((phase === "leaderboard" || phase === "finished") && standing) return …;
return <Centered><p>Loading...</p></Centered>;     // ← exhaustive fallback
```
Note `phase === "question" && question` — the phase alone is not trusted; the payload must also be present,
so a phase flip that outran its data renders the fallback instead of crashing on `question.text`.
`HootHostClient` chooses the other idiom (`{phase === "lobby" && (…)}` blocks) for the same machine — both
are present in the codebase, which makes them easy to compare.

---

## 10. Server Actions called from client components

```tsx
// src/components/TabSwitchMonitor.tsx:4
import { reportTabSwitch } from "@/app/quiz/[id]/actions";
// …
const result = await reportTabSwitch(quizId);
setCount(result.tabSwitchCount);
if (result.failed) { failedRef.current = true; onFailed(); }
```

A `"use client"` component imports a `"use server"` function and `await`s it like a local async function.
What actually ships to the browser is a reference; the call becomes an HTTP POST. It returns a typed object,
so this is an RPC with no API route, no `fetch`, no manual JSON.

**The security lesson that belongs with this pattern:** because the action is a real endpoint, the client
can call it with any argument. That is why `reportTabSwitch` re-derives the student from the cookie and
recomputes the count server-side instead of accepting one — and it is why the six IDOR bugs in
`SECURITY_AUDIT.md` are bugs: they validate a parent id and then trust an unvalidated child id.

### Binding arguments
```tsx
// quiz/[id]/q/[index]/page.tsx:56
const action = selectAnswer.bind(null, id, question.id, option.id);
return <form action={action}>…</form>;
```
`.bind` pre-applies the server-side arguments so the ids never appear as form fields. Used consistently —
`updateQuizQuestion.bind(null, id, qid)`, `setQuizStatus.bind(null, quiz.id, s.value)`, and so on. It is
also what lets every option tile be its own tiny form.

---

## 11. Composition

- **Shared primitives:** `OptionTile` / `OptionGrid` (`AnswerTiles.tsx`) are used by all three answering
  UIs — HootArena, legacy LIVE, legacy ASYNC — driven by a `state: "idle" | "selected" | "dimmed"` prop
  rather than booleans. One prop, three mutually exclusive looks, no invalid combinations.
- **`children` for layout:** a local `function Centered({children})` is defined in five different files.
  Mild duplication, deliberately local.
- **Client islands inside server pages:** `QuestionClientControls` is the pattern to study — the page stays
  a Server Component and only the timer/monitor pair is interactive, receiving server-computed values
  (`initialRemainingSeconds`, `tabSwitchCount`) as plain props.
- **Render-prop-free:** no HOCs, no render props, no `forwardRef` anywhere. Plain function components.

---

## 12. Loading, error and `Suspense` — honestly, absent

There is **no `loading.tsx`, `error.tsx`, `global-error.tsx` or `not-found.tsx` anywhere in `src/app`**
(verified: zero files), no `<Suspense>`, and no error boundary. Consequences:
- every navigation blocks on the server render with no skeleton;
- any thrown error renders Next's unstyled default page;
- `notFound()` is used heavily, so every 404 is off-brand.

This is the single highest-value, lowest-risk React improvement available, and the best honest answer to
"what's missing?" — see `FUTURE_DEVELOPMENT_GUIDE.md`.

---

## 13. Smaller things worth noticing

- **`CountUp`** uses `requestAnimationFrame` with cubic easing and respects
  `prefers-reduced-motion` by jumping straight to the final value — accessibility handled in JS, not just
  CSS.
- **`ThemeInitScript`** runs a blocking inline script with `strategy="beforeInteractive"` so
  `html[data-theme]` is set **before first paint**. This is why there is no theme flash, and it is why
  `ThemeToggle` reads the theme *from the DOM* on mount rather than assuming dark.
- **`localStorage` is always wrapped in `try/catch`** (`ThemeToggle.tsx:26-31`) — private browsing throws.
- **A props-mutation smell:** `QuizQuestionForm.tsx:29-30` and `QuestionForm.tsx:27-28` do
  `const opts = defaults?.options ?? [...]; while (opts.length < 4) opts.push("")` — which **mutates the
  array that came in as a prop**. Harmless today because callers build a fresh array each render, but it is
  exactly the kind of thing an examiner will spot. The fix is `[...(defaults?.options ?? []), "", "", "", ""].slice(0,4)`.
- **`suppressHydrationWarning`** on `<html>` (`layout.tsx:26`) — necessary because the init script mutates
  `data-theme` before React hydrates.

---

## Concepts to be ready to discuss in a practical exam

Grounded in this project, roughly in order of how likely they are to come up:

1. **Server vs Client Components** — what `"use client"` actually marks (a bundle boundary, not "this is
   interactive"), and why `src/app/dashboard/page.tsx` needs no `useEffect`.
2. **`useEffect` for subscriptions, and the cleanup function** — the socket effect, and why named handlers
   are required for `socket.off`.
3. **Dependency arrays** — what `[gameId, playerId, clientToken]` means, and the two deliberate
   `eslint-disable react-hooks/exhaustive-deps` in `QuizTimer`/`TabSwitchMonitor` (be ready to defend or
   criticise them).
4. **`useState` vs `useRef`** — `TabSwitchMonitor`'s `awayRef` is the sharpest example: a ref because the
   value must update *synchronously* and renders nothing.
5. **Functional `setState`** — `setPhase(p => p === "connecting" ? "lobby" : p)` and why the plain form is
   a bug there.
6. **Controlled vs uncontrolled inputs** — and that this codebase prefers uncontrolled + `FormData`.
7. **Keys** — stable ids, and the `HootTop3` case where privacy dictated the key.
8. **Server Actions** — `.bind` for arguments, `useActionState` for returned state, and that an action is
   a public endpoint that must re-authorise.
9. **Derived state over stored state** — recomputing `timeLeft` from `startedAt` instead of decrementing.
10. **What's missing and why it matters** — error boundaries, `loading.tsx`, `Suspense`; and the 4
    `set-state-in-effect` lint errors with their modern fixes.
11. **Why no Context/Redux here** — and when you *would* reach for them.
12. **`useMemo`/`useCallback` honestly** — that premature memoisation is a cost, and this codebase is right
    to use them sparingly.
