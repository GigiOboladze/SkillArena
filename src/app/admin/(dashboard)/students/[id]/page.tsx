import { Select } from "@/components/ui/Select";
import { NOTE_META } from "@/lib/note-meta";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/session";
import { listPrograms } from "@/lib/programs";
import { readPasswordFlash } from "@/lib/password-flash";
import { getProgramStudentStats, motivationLevel } from "@/lib/student-stats";
import {
  setStudentPassword,
  changeStudentProgram,
  resetStudentPassword,
  deleteStudent,
  updateStudentProfile,
  setStudentMotivation,
  addStudentNote,
  deleteStudentNote,
  addScheduleEntry,
  updateScheduleEntry,
  deleteScheduleEntry,
} from "../actions";
import { SetPasswordForm } from "../SetPasswordForm";
import { ChangeProgramForm } from "../ChangeProgramForm";
import { DeleteStudentButton } from "../DeleteStudentButton";
import { Avatar } from "@/components/student/Avatar";
import { IconTrophy } from "@/components/student/Icons";
import { Stars } from "@/components/admin/students/Stars";
import { StarRatingInput } from "@/components/admin/students/StarRatingInput";
import { NoteImagePicker } from "@/components/admin/students/NoteImagePicker";
import { ScheduleEntryFields } from "@/components/admin/students/ScheduleEntryFields";
import { ScheduleIcon } from "@/components/student/ScheduleIcon";
import { MAX_SCHEDULE_ENTRIES, formatDays } from "@/lib/schedule";
import type { StudentNoteKind } from "@/generated/prisma/client";

const STATUS_STYLES: Record<string, string> = {
  IN_PROGRESS: "badge-neutral",
  COMPLETED: "badge-success",
  FAILED: "badge-danger",
};

const PASSWORD_ERROR_MESSAGES: Record<string, string> = {
  weak: "Password must be at least 8 characters.",
  mismatch: "Passwords do not match.",
};

const PAGE_ERRORS: Record<string, string> = {
  note: "Write something before adding an update.",
  notelength: "That update is too long (4000 characters max).",
  toomany: "Attach at most 3 images.",
  size: "Each image must be 3 MB or smaller.",
  filetype: "Only PNG, JPEG, GIF or WebP images can be attached.",
  motivation: "Motivation must be a number from 0 to 100.",
  schedule: "Give the class a name, at least one day, and a start and end time.",
  schedulefull: `A schedule can have at most ${MAX_SCHEDULE_ENTRIES} classes.`,
};


const TABS = [
  { key: "activity", label: "Activity Log" },
  { key: "progress", label: "Progress" },
  { key: "quizzes", label: "Quizzes" },
  { key: "schedule", label: "Schedule" },
] as const;

function formatWhen(date: Date, now: Date) {
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === now.toDateString()) return `Today, ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  const day = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
  return `${day}, ${time}`;
}

export default async function StudentProfilePage({ params, searchParams }: PageProps<"/admin/students/[id]">) {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const { id } = await params;
  const search = await searchParams;
  const tab = TABS.some((t) => t.key === search?.tab) ? (search?.tab as (typeof TABS)[number]["key"]) : "activity";
  const justUpdated = search?.updated === "1";
  const programChanged = search?.programChanged === "1";
  const saved = typeof search?.saved === "string" ? search.saved : null;
  // Retrieved from a short-lived server-side store via an opaque token - the
  // password itself never travels in the URL. See src/lib/password-flash.ts.
  const revealedPassword = readPasswordFlash(typeof search?.pw === "string" ? search.pw : null);
  const pwError = typeof search?.pwerror === "string" ? PASSWORD_ERROR_MESSAGES[search.pwerror] ?? null : null;
  const pageError = typeof search?.error === "string" ? PAGE_ERRORS[search.error] ?? null : null;

  const student = await prisma.user.findFirst({
    where: { id, role: "STUDENT" },
    include: {
      program: true,
      quizAttempts: {
        where: { status: { in: ["COMPLETED", "FAILED"] } },
        include: { homework: { select: { id: true, title: true, subject: { select: { name: true } } } } },
        orderBy: { completedAt: "desc" },
      },
      subjectGroups: { include: { subject: true, group: true }, orderBy: { subject: { order: "asc" } } },
    },
  });
  if (!student) notFound();
  // Ownership check: hiding this student from a regular Admin's list is not
  // what makes this safe - a regular Admin hitting this exact URL for a
  // student in another program must be rejected here too.
  if (admin.role !== "SUPER_ADMIN" && student.programId !== admin.programId) notFound();

  const [programStats, notes, programs, schedule] = await Promise.all([
    student.programId ? getProgramStudentStats(student.programId) : Promise.resolve(null),
    prisma.studentNote.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: "desc" },
      include: { attachments: { select: { id: true, fileName: true } } },
    }),
    admin.role === "SUPER_ADMIN" ? listPrograms() : Promise.resolve([]),
    prisma.scheduleEntry.findMany({ where: { studentId: id }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
  ]);
  const st = programStats?.stats.get(student.id);
  const level = motivationLevel(student.motivation);
  const name = `${student.firstName} ${student.lastName}`;
  const now = new Date();

  const setPassword = setStudentPassword.bind(null, student.id);
  const changeProgram = changeStudentProgram.bind(null, student.id);
  const saveProfile = updateStudentProfile.bind(null, student.id);
  const saveMotivation = setStudentMotivation.bind(null, student.id);
  const addNote = addStudentNote.bind(null, student.id);
  const removeNote = deleteStudentNote.bind(null, student.id);
  const addClass = addScheduleEntry.bind(null, student.id);
  const editClass = updateScheduleEntry.bind(null, student.id);
  const removeClass = deleteScheduleEntry.bind(null, student.id);

  // Progress tab: finished quizzes oldest -> newest, as a percentage.
  const history = [...student.quizAttempts]
    .reverse()
    .map((a) => ({
      id: a.id,
      title: a.homework.title,
      subject: a.homework.subject?.name ?? null,
      pct: a.totalQuestions > 0 ? Math.round((a.score / a.totalQuestions) * 100) : 0,
      failed: a.status === "FAILED",
      at: a.completedAt ?? a.startedAt,
    }));
  const bySubject = new Map<string, { score: number; total: number }>();
  for (const a of student.quizAttempts) {
    const key = a.homework.subject?.name ?? "Other";
    const cur = bySubject.get(key) ?? { score: 0, total: 0 };
    cur.score += a.score;
    cur.total += a.totalQuestions;
    bySubject.set(key, cur);
  }

  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/students" className="inline-flex w-fit items-center gap-2 font-medium text-rahoot-ink hover:text-rahoot-red">
        <span aria-hidden>&larr;</span> Back to Students
      </Link>

      {/* ---------------- Header ---------------- */}
      <header className="sa-sp-head">
        <svg className="sa-st-wave" viewBox="0 0 600 120" preserveAspectRatio="none" aria-hidden>
          <path d="M0 110 C 180 110, 280 20, 600 30" fill="none" strokeWidth="3" />
        </svg>
        <Avatar seed={student.id} firstName={student.firstName} lastName={student.lastName} size={140} className="sa-avatar-tile sa-sp-avatar" />
        <div className="relative min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="sa-pg-title !mt-0 break-words">{name}</h1>
            <Link href={`/admin/students/${student.id}/edit`} className="sa-sp-pencil" aria-label="Edit student details" title="Edit details">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" />
              </svg>
            </Link>
          </div>
          <p className="mt-1 text-lg text-rahoot-muted">@{student.username}</p>
          {st && (
            <span className="sa-sp-rank">
              <IconTrophy className="h-4 w-4" />#{st.rank} on Leaderboard
            </span>
          )}
        </div>
        <details className="sa-menu sa-sp-menu">
          <summary aria-label="Student actions">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
              <circle cx="5.5" cy="12" r="1.7" />
              <circle cx="12" cy="12" r="1.7" />
              <circle cx="18.5" cy="12" r="1.7" />
            </svg>
          </summary>
          <div className="sa-menu-panel sa-sp-menu-panel">
            <Link href={`/admin/students/${student.id}/edit`}>Edit details &amp; subjects</Link>
            <form action={resetStudentPassword}>
              <input type="hidden" name="studentId" value={student.id} />
              <button type="submit">Reset password (auto-generate)</button>
            </form>
            <div className="sa-menu-section">
              <p className="sa-menu-heading">Set a new password</p>
              <SetPasswordForm action={setPassword} studentName={name} />
            </div>
            {admin.role === "SUPER_ADMIN" && (
              <div className="sa-menu-section">
                <p className="sa-menu-heading">Program</p>
                <ChangeProgramForm action={changeProgram} programs={programs} currentProgramId={student.programId} />
              </div>
            )}
            <form action={deleteStudent} className="sa-menu-section">
              <input type="hidden" name="studentId" value={student.id} />
              <DeleteStudentButton name={name} className="is-danger" />
            </form>
          </div>
        </details>
      </header>

      {/* ---------------- Notices ---------------- */}
      {justUpdated && <p className="text-sm font-medium text-green-400">Changes saved.</p>}
      {saved === "profile" && <p className="text-sm font-medium text-green-400">Profile saved.</p>}
      {saved === "motivation" && <p className="text-sm font-medium text-green-400">Motivation updated.</p>}
      {saved === "schedule" && <p className="text-sm font-medium text-green-400">Schedule saved.</p>}
      {saved === "scheduledeleted" && <p className="text-sm font-medium text-green-400">Class removed from the schedule.</p>}
      {programChanged && (
        <p className="text-sm font-medium text-green-400">Program changed. Previous subject/group assignments were cleared.</p>
      )}
      {pwError && <p className="text-sm font-medium text-rahoot-red">{pwError}</p>}
      {pageError && <p className="text-sm font-medium text-rahoot-red">{pageError}</p>}
      {revealedPassword && (
        <div className="sa-panel border-2 !border-rahoot-red p-4">
          <p className="font-semibold">New password for @{student.username}</p>
          <p className="mt-1 text-sm text-rahoot-muted">
            Password: <span className="select-all font-mono text-rahoot-ink">{revealedPassword}</span>
          </p>
          <p className="mt-2 text-xs text-rahoot-muted">
            This is shown once and can&apos;t be retrieved again - copy it now. The student has been signed out everywhere and
            must log in again with it.
          </p>
        </div>
      )}

      {/* ---------------- Stat strip ---------------- */}
      <section className="sa-sp-strip">
        <div className="sa-sp-stat">
          <span className={`sa-sp-stat-icon is-${level?.tone === "bad" ? "red" : level?.tone === "medium" ? "amber" : "green"}`} aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
              <path d="m3.5 17 6-6 4 4 7-7.5M15 7.5h5.5V13" />
            </svg>
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="sa-sp-stat-label">Motivation</p>
                <details className="sa-pop">
                  <summary className="sa-sp-pencil !h-6 !w-6" aria-label="Update motivation" title="Update motivation">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
                      <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" />
                    </svg>
                  </summary>
                  <form action={saveMotivation} className="sa-pop-panel">
                    <p className="font-bold">Update motivation</p>
                    <p className="text-xs text-rahoot-muted">75-100% going well &middot; 40-74% medium &middot; 0-39% needs attention</p>
                    <label className="sa-pg-field">
                      Motivation (%)
                      <input type="number" name="motivation" min={0} max={100} required defaultValue={student.motivation ?? 75} className="sa-pg-input" />
                    </label>
                    <label className="sa-pg-field">
                      Note <span className="font-normal text-rahoot-muted">(optional, added to the log)</span>
                      <textarea name="note" rows={2} maxLength={2000} className="sa-pg-input !h-auto py-2" placeholder="Why did it change?" />
                    </label>
                    <Select name="as" className="sa-pg-input" aria-label="Post as" defaultValue="Admin">
                      <option value="Admin">Post as {admin.role === "SUPER_ADMIN" ? "Super Admin" : "Admin"}</option>
                      <option value="Lecturer">Post as Lecturer</option>
                    </Select>
                    <button type="submit" className="sa-qd-primary !h-11 justify-center">
                      Save motivation
                    </button>
                  </form>
                </details>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="sa-sp-stat-value">{student.motivation === null ? "-" : `${student.motivation}%`}</span>
              {level && <span className={`sa-mot-pill is-${level.tone}`}>{level.label}</span>}

            </div>
          </div>
        </div>
        <div className="sa-sp-stat">
          <span className="sa-sp-stat-icon is-violet" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
              <circle cx="12" cy="12" r="8.5" />
              <circle cx="12" cy="12" r="4" />
            </svg>
          </span>
          <div>
            <p className="sa-sp-stat-label">Quiz Accuracy</p>
            <span className="sa-sp-stat-value">{st?.accuracy === null || st?.accuracy === undefined ? "-" : `${st.accuracy}%`}</span>
          </div>
        </div>
        <div className="sa-sp-stat">
          <span className="sa-sp-stat-icon is-violet" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinejoin="round" className="h-6 w-6">
              <path d="m12 2.8 2.75 5.6 6.15.9-4.45 4.33 1.05 6.12L12 16.87l-5.5 2.88 1.05-6.12L3.1 9.3l6.15-.9L12 2.8Z" />
            </svg>
          </span>
          <div>
            <p className="sa-sp-stat-label">Communication</p>
            <div className="flex items-center gap-2">
              <span className="sa-sp-stat-value">{student.communicationSkill ? student.communicationSkill.toFixed(1) : "-"}</span>
              <Stars value={student.communicationSkill} />
            </div>
          </div>
        </div>
        <div className="sa-sp-stat">
          <span className="sa-sp-stat-icon is-violet" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
              <path d="m12 4 8.5 4.5L12 13 3.5 8.5 12 4Z" />
              <path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5" />
            </svg>
          </span>
          <div>
            <p className="sa-sp-stat-label">ArenaPoints</p>
            <span className="sa-sp-stat-value">
              {(st?.points ?? 0).toLocaleString()} <span className="text-base font-semibold text-rahoot-muted">AP</span>
            </span>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)]">
        {/* ---------------- Left: information ---------------- */}
        <section className="sa-sp-panel">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Student Information</h2>
            <details className="sa-pop">
              <summary className="sa-sp-edit-link">Edit</summary>
              <form action={saveProfile} className="sa-pop-panel !right-0">
                <p className="font-bold">Hobby &amp; communication</p>
                <label className="sa-pg-field">
                  Hobby
                  <input name="hobby" maxLength={220} defaultValue={student.hobby ?? ""} placeholder="e.g. Gaming, Music, Football (comma-separated)" className="sa-pg-input" />
                </label>
                <div className="sa-pg-field">
                  Communication skill
                  <StarRatingInput defaultValue={student.communicationSkill} allowClear />
                </div>
                <button type="submit" className="sa-qd-primary !h-11 justify-center">
                  Save
                </button>
              </form>
            </details>
          </div>
          <dl className="sa-sp-info">
            <div>
              <dt>Program</dt>
              <dd>{student.program?.name ?? "No program"}</dd>
            </div>
            <div>
              <dt>Hobby</dt>
              <dd>{student.hobby ?? <span className="text-rahoot-muted">Not set</span>}</dd>
            </div>
            <div>
              <dt>Communication Skill</dt>
              <dd className="flex items-center gap-2">
                {student.communicationSkill ? (
                  <>
                    {student.communicationSkill.toFixed(1)} / 5 <Stars value={student.communicationSkill} />
                  </>
                ) : (
                  <span className="text-rahoot-muted">Not rated</span>
                )}
              </dd>
            </div>
            <div>
              <dt>Quiz Accuracy</dt>
              <dd>{st?.accuracy === null || st?.accuracy === undefined ? "-" : `${st.accuracy}%`}</dd>
            </div>
            <div>
              <dt>Leaderboard Position</dt>
              <dd>{st ? `#${st.rank}` : "-"}</dd>
            </div>
          </dl>

          <h2 className="mt-7 text-xl font-bold">Subject Assignments</h2>
          {student.subjectGroups.length === 0 ? (
            <p className="mt-3 text-sm text-rahoot-muted">No subjects assigned yet.</p>
          ) : (
            <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {student.subjectGroups.map((sg) => (
                <li key={sg.id} className="sa-sp-subject">
                  <span className="font-semibold">{sg.subject.name}</span>
                  <span className="text-rahoot-muted">&ndash; {sg.group?.name ?? "No group yet"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------------- Right: tabs ---------------- */}
        <section className="sa-sp-panel !p-3">
          <nav className="sa-sp-tabs" aria-label="Student sections">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={t.key === "activity" ? `/admin/students/${student.id}` : `/admin/students/${student.id}?tab=${t.key}`}
                className={tab === t.key ? "is-active" : undefined}
                aria-current={tab === t.key ? "page" : undefined}
              >
                {t.label}
              </Link>
            ))}
          </nav>

          {tab === "activity" && (
            <div className="px-2 pb-2 pt-4">
              {notes.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-rahoot-muted">
                  No updates yet. Add a comment, a progress note or an issue below - every admin will see it here.
                </p>
              ) : (
                <ol className="sa-timeline">
                  {notes.map((n) => {
                    const meta = NOTE_META[n.kind];
                    const canDelete = admin.role === "SUPER_ADMIN" || n.authorId === admin.id;
                    return (
                      <li key={n.id} className={`is-${meta.tone}`}>
                        <span className="sa-timeline-dot" aria-hidden />
                        <div className="sa-note">
                          <span className={`sa-note-icon is-${meta.tone}`} aria-hidden>
                            <NoteIcon kind={n.kind} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                              <p className="font-bold">{meta.title}</p>
                              <p className="flex items-center gap-2 text-xs text-rahoot-muted">
                                <span title={n.createdAt.toISOString()}>{formatWhen(n.createdAt, now)}</span>
                                <span className="sa-note-role">{n.authorRole}</span>
                              </p>
                            </div>
                            <p className="mt-1 whitespace-pre-line break-words text-sm text-rahoot-muted">{n.body}</p>
                            {n.attachments.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {n.attachments.map((a) => (
                                  <a key={a.id} href={`/admin/student-files/${a.id}`} target="_blank" rel="noopener noreferrer" className="sa-note-thumb">
                                    {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked image route */}
                                    <img src={`/admin/student-files/${a.id}`} alt={a.fileName} loading="lazy" />
                                  </a>
                                ))}
                              </div>
                            )}
                            <div className="mt-1 flex items-center justify-between gap-3 text-xs text-rahoot-muted">
                              <span>by {n.authorName}</span>
                              {canDelete && (
                                <form action={removeNote}>
                                  <input type="hidden" name="noteId" value={n.id} />
                                  <button type="submit" className="hover:text-rahoot-red">
                                    Delete
                                  </button>
                                </form>
                              )}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}

              <form action={addNote} className="sa-composer">
                <div className="sa-composer-box">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="mt-3 h-6 w-6 flex-none text-rahoot-muted" aria-hidden>
                    <path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4.5 3.5v-3.5h-1v-10Z" />
                    <path d="M8.5 9.5h7M8.5 12.5h4.5" />
                  </svg>
                  <textarea name="body" required rows={1} maxLength={4000} placeholder="Add a comment or update..." aria-label="Comment or update" />
                  <NoteImagePicker />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select name="kind" className="sa-composer-select" aria-label="Type of update" defaultValue="COMMENT">
                    <option value="COMMENT">Comment</option>
                    <option value="PROGRESS">Progress</option>
                    <option value="ISSUE">Issue</option>
                  </Select>
                  <Select name="as" className="sa-composer-select" aria-label="Post as" defaultValue="Admin">
                    <option value="Admin">as {admin.role === "SUPER_ADMIN" ? "Super Admin" : "Admin"}</option>
                    <option value="Lecturer">as Lecturer</option>
                  </Select>
                  <button type="submit" className="sa-qd-primary !h-12 flex-1 justify-center sm:flex-none">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
                      <path d="M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5 21 3Z" />
                    </svg>
                    Add update
                  </button>
                </div>
              </form>
            </div>
          )}

          {tab === "progress" && (
            <div className="px-3 pb-3 pt-5">
              {history.length === 0 ? (
                <p className="py-6 text-center text-sm text-rahoot-muted">No finished quizzes yet.</p>
              ) : (
                <>
                  <h3 className="font-bold">Score per quiz</h3>
                  <p className="text-sm text-rahoot-muted">Oldest to newest, as a percentage of questions answered correctly.</p>
                  <div className="sa-bars" role="img" aria-label="Quiz scores over time">
                    {history.slice(-24).map((h) => (
                      <span key={h.id} className={h.failed ? "is-failed" : undefined} style={{ height: `${Math.max(4, h.pct)}%` }} title={`${h.title}: ${h.failed ? "failed" : `${h.pct}%`}`} />
                    ))}
                  </div>
                  <h3 className="mt-6 font-bold">Accuracy by subject</h3>
                  <ul className="mt-3 flex flex-col gap-3">
                    {[...bySubject.entries()].map(([subject, v]) => {
                      const pct = v.total > 0 ? Math.round((v.score / v.total) * 100) : 0;
                      return (
                        <li key={subject}>
                          <div className="flex justify-between text-sm">
                            <span className="font-semibold">{subject}</span>
                            <span className="text-rahoot-muted">{pct}%</span>
                          </div>
                          <div className="sa-meter">
                            <span style={{ width: `${pct}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          )}

          {tab === "quizzes" && (
            <div className="px-2 pb-2 pt-4">
              {student.quizAttempts.length === 0 ? (
                <p className="py-6 text-center text-sm text-rahoot-muted">No completed or failed attempts yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {student.quizAttempts.map((attempt) => (
                    <li key={attempt.id} className="sa-note flex-wrap !items-center justify-between">
                      <div className="min-w-0">
                        <Link href={`/admin/quizzes/${attempt.homework.id}/results`} className="font-semibold hover:text-rahoot-red hover:underline">
                          {attempt.homework.title}
                        </Link>
                        <p className="text-sm text-rahoot-muted">
                          {attempt.tabSwitchCount} tab switch{attempt.tabSwitchCount === 1 ? "" : "es"}
                          {attempt.failureReason ? ` · ${attempt.failureReason}` : ""} &middot;{" "}
                          {formatWhen(attempt.completedAt ?? attempt.startedAt, now)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold">
                          {attempt.score} / {attempt.totalQuestions}
                        </span>
                        <span className={`badge ${STATUS_STYLES[attempt.status]}`}>{attempt.status}</span>
                        {attempt.status !== "FAILED" && (
                          <Link href={`/admin/students/${student.id}/attempts/${attempt.id}`} className="btn btn-outline !px-3 !py-1.5 text-sm">
                            View answers
                          </Link>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === "schedule" && (
            <div className="px-2 pb-2 pt-4">
              <p className="px-1 text-sm text-rahoot-muted">
                These classes show on {student.firstName}&apos;s dashboard under &ldquo;Class Schedule&rdquo;.
              </p>
              {schedule.length === 0 ? (
                <p className="py-6 text-center text-sm text-rahoot-muted">No classes yet - add the first one below.</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {schedule.map((e) => (
                    <li key={e.id} className={`sa-sched-row is-${e.tone} sa-sched-admin`}>
                      <span className="sa-sched-icon" aria-hidden>
                        <ScheduleIcon icon={e.icon} className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">{e.title}</p>
                        <p className="text-xs text-rahoot-muted">
                          {formatDays(e.days)} &middot; {e.startTime} &ndash; {e.endTime}
                          {e.room ? ` · ${e.room}` : ""}
                        </p>
                      </div>
                      <details className="sa-pop">
                        <summary className="sa-ghost-btn !px-3" aria-label={`Edit ${e.title}`}>
                          Edit
                        </summary>
                        <div className="sa-pop-panel !right-0 sa-schf-pop">
                          <form action={editClass} className="flex flex-col gap-3">
                            <input type="hidden" name="entryId" value={e.id} />
                            <ScheduleEntryFields idPrefix={`e-${e.id}`} values={e} />
                            <button type="submit" className="sa-qd-primary justify-center">
                              Save class
                            </button>
                          </form>
                        </div>
                      </details>
                      <form action={removeClass}>
                        <input type="hidden" name="entryId" value={e.id} />
                        <button type="submit" className="sa-ghost-btn !px-3 hover:!text-rahoot-red" aria-label={`Remove ${e.title}`}>
                          Remove
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}

              {schedule.length < MAX_SCHEDULE_ENTRIES && (
                <form action={addClass} className="sa-schf-add">
                  <h3 className="font-bold">Add a class</h3>
                  <ScheduleEntryFields idPrefix="new" />
                  <button type="submit" className="sa-qd-primary justify-center self-start">
                    Add class
                  </button>
                </form>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function NoteIcon({ kind }: { kind: StudentNoteKind }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className: "h-6 w-6" };
  if (kind === "MOTIVATION") {
    return (
      <svg {...common}>
        <path d="m3.5 17 6-6 4 4 7-7.5M15 7.5h5.5V13" />
      </svg>
    );
  }
  if (kind === "ISSUE") {
    return (
      <svg {...common}>
        <path d="M12 4 2.5 20h19L12 4ZM12 10v4.5M12 17.5h.01" />
      </svg>
    );
  }
  if (kind === "PROGRESS") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="m8.3 12.3 2.6 2.6 5-5.4" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="5" y="3.5" width="14" height="17" rx="2.5" />
      <path d="M9 8.5h6M9 12h6M9 15.5h3.5" />
    </svg>
  );
}
