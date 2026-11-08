import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStudent } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getProgram } from "@/lib/programs";
import { eligibleHomeworkWhere } from "@/lib/subjects";
import { HOBBY_SUGGESTIONS, MAX_HOBBIES, MAX_HOBBY_LENGTH, hobbyIcon, parseHobbies, type HobbyIcon } from "@/lib/hobbies";
import { Avatar } from "@/components/student/Avatar";
import { PasswordInput } from "@/components/PasswordInput";
import {
  updateStudentUsername,
  updateStudentPassword,
  updateStudentName,
  addStudentHobby,
  removeStudentHobby,
} from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  username: "Please enter a username (up to 40 characters).",
  taken: "This username is already in use.",
  weak: "Password must be at least 8 characters.",
  mismatch: "Passwords do not match.",
  name: "Please enter a first and last name (up to 40 characters each).",
  hobby: "Type a hobby first.",
  hobbyfull: `You can have up to ${MAX_HOBBIES} hobbies - remove one to add another.`,
};
const UPDATED_MESSAGES: Record<string, string> = {
  username: "Username updated.",
  name: "Name updated.",
  hobby: "Hobbies updated.",
};

export default async function StudentProfilePage({ searchParams }: PageProps<"/dashboard/profile">) {
  const student = await getCurrentStudent();
  if (!student) redirect("/login");

  const search = await searchParams;
  const errorKey = typeof search?.error === "string" ? search.error : null;
  const error = errorKey ? ERROR_MESSAGES[errorKey] ?? null : null;
  const updatedKey = typeof search?.updated === "string" ? search.updated : null;
  const updated = updatedKey ? UPDATED_MESSAGES[updatedKey] ?? null : null;
  const manageHobbies = search?.hobbies === "manage";
  const programId = student.programId;

  const [program, finished, eligibleWhere] = await Promise.all([
    programId ? getProgram(programId) : null,
    // Scoped to the student's current program, same policy as the
    // leaderboard (see getCumulativeLeaderboard's doc comment) - so the
    // total shown here always matches what the leaderboard shows for them.
    prisma.quizAttempt.findMany({
      where: {
        studentId: student.id,
        status: { in: ["COMPLETED", "FAILED"] },
        homework: { subject: { programId: programId ?? undefined } },
      },
      select: { score: true, homeworkId: true, status: true },
    }),
    eligibleHomeworkWhere(student.id, programId),
  ]);
  // Quizzes still open to this student that they haven't finished yet
  // (includes one they started but didn't submit).
  const finishedIds = finished.map((a) => a.homeworkId);
  const [pending, everAssigned] = await Promise.all([
    prisma.homework.count({ where: { mode: "QUIZ", status: "OPEN", ...eligibleWhere, id: { notIn: finishedIds } } }),
    prisma.homework.count({ where: { mode: "QUIZ", status: { in: ["OPEN", "CLOSED"] }, ...eligibleWhere } }),
  ]);
  const completed = finished.filter((a) => a.status === "COMPLETED").length;
  // "X / Y": Y = every quiz this student was ever given (open or closed) plus
  // anything they finished that has since been retargeted - never below X.
  const totalAssigned = Math.max(everAssigned, finished.length + pending, completed);
  const totalScore = finished.reduce((sum, a) => sum + a.score, 0);
  const hobbies = parseHobbies(student.hobby);
  const name = `${student.firstName} ${student.lastName}`;

  const nameOpen = errorKey === "name";
  const usernameOpen = errorKey === "username" || errorKey === "taken";
  const passwordOpen = errorKey === "weak" || errorKey === "mismatch";
  const hobbyOpen = errorKey === "hobby";

  return (
    <div className="sa-mp flex flex-col gap-5">
      {/* ---------------- Header ---------------- */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/dashboard" className="sa-mp-back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
              <path d="M19 12H5M11 6l-6 6 6 6" />
            </svg>
            Back to dashboard
          </Link>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">My Profile</h1>
        </div>
        {program && (
          <div className="sa-mp-program">
            <span className="sa-mp-program-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4M13.5 6l-3 12" />
              </svg>
            </span>
            <span className="font-bold">Program</span>
            <span className="sa-mp-program-sep" aria-hidden />
            <span className="truncate font-semibold">{program.name}</span>
          </div>
        )}
      </header>

      {error && (
        <p role="alert" className="text-sm font-medium text-rahoot-red">
          {error}
        </p>
      )}
      {updated && <p className="text-sm font-medium text-green-400">{updated}</p>}

      {/* ---------------- Identity + stats ---------------- */}
      <section className="sa-mp-card sa-mp-hero">
        <div className="sa-mp-id">
          <div className="sa-mp-avatar">
            {/* The student's pet goes here once pets launch (Avatar's `src`). */}
            <Avatar seed={student.id} firstName={student.firstName} lastName={student.lastName} size={168} />
          </div>
          <div className="min-w-0">
            <p className="sa-mp-name">{name}</p>
            {program && <span className="sa-mp-chip">{program.name}</span>}
            <p className="mt-3 flex items-center gap-2 text-sm text-rahoot-muted">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] flex-none text-[#a78bfa]" aria-hidden>
                <circle cx="12" cy="8" r="4" />
                <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
              </svg>
              <span className="truncate">@{student.username}</span>
            </p>
          </div>
        </div>
        <dl className="sa-mp-stats">
          <div>
            <dt className="sa-mp-stat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-9 w-9" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="m8 12.3 2.7 2.7L16 9.6" />
              </svg>
              <span className="sa-mp-stat-label">Completed Quizzes</span>
            </dt>
            <dd className="sa-mp-stat-value">
              {completed} / {totalAssigned}
            </dd>
          </div>
          <div>
            <dt className="sa-mp-stat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-9 w-9" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              <span className="sa-mp-stat-label">Pending Quizzes</span>
            </dt>
            <dd className="sa-mp-stat-value">{pending}</dd>
          </div>
          <div>
            <dt className="sa-mp-stat-icon">
              <svg viewBox="0 0 24 24" className="h-9 w-9" aria-hidden>
                <path d="m12 2.8 2.8 5.8 6.3.8-4.6 4.4 1.2 6.2L12 17l-5.7 3 1.2-6.2-4.6-4.4 6.3-.8L12 2.8Z" fill="currentColor" />
              </svg>
              <span className="sa-mp-stat-label">Total Points</span>
            </dt>
            <dd className="sa-mp-stat-value">{totalScore.toLocaleString()}</dd>
          </div>
        </dl>
      </section>

      {/* ---------------- Pets + hobbies ---------------- */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
        <section className="sa-mp-card" aria-labelledby="mp-pets">
          <h2 id="mp-pets" className="sa-mp-title">
            <svg viewBox="0 0 24 24" className="h-7 w-7 text-[#a78bfa]" aria-hidden>
              <ellipse cx="12" cy="16" rx="4.6" ry="4" fill="currentColor" />
              <ellipse cx="5.3" cy="10.4" rx="2" ry="2.5" fill="currentColor" />
              <ellipse cx="9.2" cy="6.3" rx="2" ry="2.6" fill="currentColor" />
              <ellipse cx="14.8" cy="6.3" rx="2" ry="2.6" fill="currentColor" />
              <ellipse cx="18.7" cy="10.4" rx="2" ry="2.5" fill="currentColor" />
            </svg>
            Student PETs
          </h2>
          {/* Pets aren't live yet - these slots are where they'll appear. */}
          <ul className="sa-mp-pets">
            {[1, 2, 3].map((n) => (
              <li key={n}>
                <span className="sa-mp-pet-tile" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-9 w-9">
                    <path d="M12 3.5c-3.6 0-6.5 4.6-6.5 9.2 0 4 2.9 7.8 6.5 7.8s6.5-3.8 6.5-7.8c0-4.6-2.9-9.2-6.5-9.2Z" />
                    <path d="M9.5 11.5h.01M14.5 11.5h.01M10.3 14.8c1 .7 2.4.7 3.4 0" />
                  </svg>
                </span>
                <span className="text-sm font-semibold">Coming soon</span>
                <span className="sa-mp-level">Level -</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-center text-xs text-rahoot-muted">Your pets will hatch here soon - keep earning points!</p>
        </section>

        <section className="sa-mp-card" aria-labelledby="mp-hobbies">
          <div className="flex items-center justify-between gap-3">
            <h2 id="mp-hobbies" className="sa-mp-title">
              <svg viewBox="0 0 24 24" className="h-7 w-7 text-[#a78bfa]" aria-hidden>
                <path d="m12 2.8 2.8 5.8 6.3.8-4.6 4.4 1.2 6.2L12 17l-5.7 3 1.2-6.2-4.6-4.4 6.3-.8L12 2.8Z" fill="currentColor" />
              </svg>
              Hobbies
            </h2>
            {hobbies.length > 0 && (
              <Link href={manageHobbies ? "/dashboard/profile" : "/dashboard/profile?hobbies=manage"} className="sa-mp-link" scroll={false}>
                {manageHobbies ? "Done" : "Manage Hobbies"}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
                  {manageHobbies ? <path d="m5 12.5 4.5 4.5L19 7.5" /> : <path d="M5 12h14M13 6l6 6-6 6" />}
                </svg>
              </Link>
            )}
          </div>
          <ul className="sa-mp-hobbies">
            {hobbies.map((h) => (
              <li key={h} className="sa-mp-hobby">
                <HobbyGlyph icon={hobbyIcon(h)} />
                <span>{h}</span>
                {manageHobbies && (
                  <form action={removeStudentHobby}>
                    <input type="hidden" name="hobby" value={h} />
                    <button type="submit" className="sa-mp-hobby-x" aria-label={`Remove ${h}`}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden>
                        <path d="M6 6l12 12M18 6 6 18" />
                      </svg>
                    </button>
                  </form>
                )}
              </li>
            ))}
            {hobbies.length < MAX_HOBBIES && (
              <li>
                <details className="sa-pop" open={hobbyOpen || undefined}>
                  <summary className="sa-mp-hobby is-add">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="h-4 w-4" aria-hidden>
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Add Hobby
                  </summary>
                  <div className="sa-pop-panel sa-mp-pop">
                    <form action={addStudentHobby} className="flex gap-2">
                      <input name="hobby" required maxLength={MAX_HOBBY_LENGTH} placeholder="Type a hobby" aria-label="New hobby" className="sa-mp-input" />
                      <button type="submit" className="sa-qd-primary !h-11 !px-4">
                        Add
                      </button>
                    </form>
                    <div className="flex flex-wrap gap-1.5">
                      {HOBBY_SUGGESTIONS.filter((s) => !hobbies.some((h) => h.toLowerCase() === s.toLowerCase())).map((s) => (
                        <form key={s} action={addStudentHobby}>
                          <input type="hidden" name="hobby" value={s} />
                          <button type="submit" className="sa-mp-suggest">
                            + {s}
                          </button>
                        </form>
                      ))}
                    </div>
                  </div>
                </details>
              </li>
            )}
          </ul>
          {hobbies.length === 0 && <p className="mt-3 text-sm text-rahoot-muted">Add a few hobbies so your lecturers get to know you.</p>}
        </section>
      </div>

      {/* ---------------- Personal info + account ---------------- */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="sa-mp-card" aria-labelledby="mp-personal">
          <div className="flex items-start justify-between gap-3">
            <h2 id="mp-personal" className="sa-mp-title">
              <svg viewBox="0 0 24 24" className="h-7 w-7 text-[#a78bfa]" aria-hidden>
                <circle cx="12" cy="7.5" r="4.5" fill="currentColor" />
                <path d="M3.5 21a8.5 8.5 0 0 1 17 0H3.5Z" fill="currentColor" />
              </svg>
              Personal Information
            </h2>
            <details className="sa-pop" open={nameOpen || undefined}>
              <summary className="sa-mp-outline-btn">
                <PencilIcon />
                Edit
              </summary>
              <form action={updateStudentName} className="sa-pop-panel !right-0 sa-mp-pop">
                <label className="sa-mp-field">
                  <span>First Name</span>
                  <input name="firstName" required maxLength={40} defaultValue={student.firstName} className="sa-mp-input" />
                </label>
                <label className="sa-mp-field">
                  <span>Last Name</span>
                  <input name="lastName" required maxLength={40} defaultValue={student.lastName} className="sa-mp-input" />
                </label>
                <button type="submit" className="sa-qd-primary justify-center">
                  Save name
                </button>
              </form>
            </details>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-4">
            <div className="min-w-0">
              <dt className="sa-mp-dt">First Name</dt>
              <dd className="sa-mp-dd">{student.firstName}</dd>
            </div>
            <div className="min-w-0">
              <dt className="sa-mp-dt">Last Name</dt>
              <dd className="sa-mp-dd">{student.lastName}</dd>
            </div>
          </dl>
        </section>

        <section className="sa-mp-card" aria-labelledby="mp-account">
          <h2 id="mp-account" className="sa-mp-title">
            <svg viewBox="0 0 24 24" className="h-7 w-7 text-[#a78bfa]" aria-hidden>
              <path d="M7.5 10V7.5a4.5 4.5 0 0 1 9 0V10" fill="none" stroke="currentColor" strokeWidth="2.4" />
              <rect x="4.5" y="10" width="15" height="11" rx="2.5" fill="currentColor" />
            </svg>
            Account Settings
          </h2>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="sa-mp-dt">Username</p>
              <div className="sa-mp-dd flex items-center gap-2">
                <span className="truncate">{student.username}</span>
                <details className="sa-pop" open={usernameOpen || undefined}>
                  <summary className="sa-mp-icon-btn" aria-label="Change username">
                    <PencilIcon />
                  </summary>
                  <form action={updateStudentUsername} className="sa-pop-panel sa-mp-pop">
                    <label className="sa-mp-field">
                      <span>Username</span>
                      <input name="username" required maxLength={40} autoCapitalize="off" defaultValue={student.username} className="sa-mp-input" />
                    </label>
                    <button type="submit" className="sa-qd-primary justify-center">
                      Save username
                    </button>
                  </form>
                </details>
              </div>
            </div>
            <details className="sa-pop" open={passwordOpen || undefined}>
              <summary className="sa-mp-outline-btn">
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
                  <path d="M7.5 10V7.5a4.5 4.5 0 0 1 9 0V10" fill="none" stroke="currentColor" strokeWidth="2.4" />
                  <rect x="4.5" y="10" width="15" height="11" rx="2.5" fill="currentColor" />
                </svg>
                Change Password
              </summary>
              <form action={updateStudentPassword} className="sa-pop-panel !right-0 sa-mp-pop">
                <p className="text-xs text-rahoot-muted">
                  You&apos;ll be signed out everywhere and asked to log in again with the new password.
                </p>
                <PasswordInput name="password" required minLength={8} placeholder="New Password" ariaLabel="New password" className="sa-mp-input" />
                <PasswordInput name="confirmPassword" required minLength={8} placeholder="Confirm New Password" ariaLabel="Confirm new password" className="sa-mp-input" />
                <button type="submit" className="sa-qd-primary justify-center">
                  Change password
                </button>
              </form>
            </details>
          </div>
        </section>
      </div>
    </div>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}

function HobbyGlyph({ icon }: { icon: HobbyIcon }) {
  const p = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className: "h-5 w-5 flex-none", "aria-hidden": true };
  switch (icon) {
    case "gamepad":
      return (
        <svg {...p}>
          <path d="M7 7h10a4.5 4.5 0 0 1 4.4 5.5l-1 4.3a2.4 2.4 0 0 1-4.1 1.1L14 15.5h-4l-2.3 2.4a2.4 2.4 0 0 1-4.1-1.1l-1-4.3A4.5 4.5 0 0 1 7 7Z" />
          <path d="M8 10v3M6.5 11.5h3M15.5 11h.01M17.5 12.5h.01" />
        </svg>
      );
    case "music":
      return (
        <svg {...p}>
          <path d="M9 18V5.5l11-2V16" />
          <circle cx="6.5" cy="18" r="2.5" />
          <circle cx="17.5" cy="16" r="2.5" />
        </svg>
      );
    case "ball":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="m12 7.5 3.5 2.6-1.3 4.1H9.8l-1.3-4.1L12 7.5ZM12 3v4.5M15.5 10.1 20 8.5M14.2 14.2l2.6 3.8M9.8 14.2 7.2 18M8.5 10.1 4 8.5" />
        </svg>
      );
    case "basketball":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3v18M5.6 5.6a12 12 0 0 1 0 12.8M18.4 5.6a12 12 0 0 0 0 12.8" />
        </svg>
      );
    case "plane":
      return (
        <svg {...p}>
          <path d="M10.5 13.5 3 11l1.5-1.5 7.5 1 4.5-4.5a2.1 2.1 0 0 1 3 3L15 13.5l1 7.5-1.5 1.5-2.5-7.5-3 3V20l-1.5 1.5-1-3.5-3.5-1L5.5 15.5h2.5l3-3" />
        </svg>
      );
    case "book":
      return (
        <svg {...p}>
          <path d="M12 6.5C10.3 5.2 7.9 4.6 4 4.8v13c3.9-.2 6.3.4 8 1.7 1.7-1.3 4.1-1.9 8-1.7v-13c-3.9-.2-6.3.4-8 1.7ZM12 6.5v13" />
        </svg>
      );
    case "palette":
      return (
        <svg {...p}>
          <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.3 0 1.8-.8 1.8-1.6 0-1.3-1.1-1.5-1.1-2.6 0-.9.7-1.6 1.6-1.6h2.1a4.1 4.1 0 0 0 4.1-4.1C20.5 6.6 16.7 3.5 12 3.5Z" />
          <path d="M7.8 11h.01M10.5 7.5h.01M15 8h.01" />
        </svg>
      );
    case "code":
      return (
        <svg {...p}>
          <path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5" />
        </svg>
      );
    case "dumbbell":
      return (
        <svg {...p}>
          <path d="M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11" />
        </svg>
      );
    case "film":
      return (
        <svg {...p}>
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
          <path d="M7.5 4.5v15M16.5 4.5v15M3.5 9h4M3.5 15h4M16.5 9h4M16.5 15h4" />
        </svg>
      );
    case "camera":
      return (
        <svg {...p}>
          <path d="M4 8h3l1.5-2.5h7L17 8h3v11H4V8Z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
      );
    default:
      return (
        <svg {...p}>
          <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" />
        </svg>
      );
  }
}
