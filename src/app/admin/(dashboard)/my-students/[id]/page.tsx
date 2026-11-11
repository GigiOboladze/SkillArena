import { Select } from "@/components/ui/Select";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStaffWith } from "@/lib/staff-guard";
import { canViewStudent, quizSubjectScope } from "@/lib/scope";
import { can, isFullAdmin } from "@/lib/authz";
import { NOTE_META, WRITABLE_NOTE_KINDS } from "@/lib/note-meta";
import { getProgramStudentStats, motivationLevel } from "@/lib/student-stats";
import { parseHobbies } from "@/lib/hobbies";
import { addStudentNote, completeFollowUp } from "../actions";

const ERRORS: Record<string, string> = {
  empty: "Write something first.",
  long: "Notes can be at most 4000 characters.",
  date: "That follow-up date isn't valid.",
};

function fmt(d: Date) {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/** A student's profile as seen by a scoped staff role. 404 for any student outside the role's scope. */
export default async function ScopedStudentPage({ params, searchParams }: PageProps<"/admin/my-students/[id]">) {
  const staff = await getStaffWith("students.view");
  if (!staff) notFound();
  const { id } = await params;
  if (isFullAdmin(staff)) redirect(`/admin/students/${id}`);
  if (!(await canViewStudent(staff, id))) notFound();

  const search = await searchParams;
  const error = typeof search?.error === "string" ? ERRORS[search.error] : null;

  // Lecturers see quiz results only for the subjects they teach.
  const subjectScope = await quizSubjectScope(staff);
  const attemptWhere = subjectScope.subjectIds ? { homework: { subjectId: { in: subjectScope.subjectIds } } } : {};

  const [student, attempts, notes] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: {
        firstName: true,
        lastName: true,
        username: true,
        programId: true,
        hobby: true,
        motivation: true,
        communicationSkill: true,
        createdAt: true,
        program: { select: { name: true } },
        cohortMembership: { select: { cohort: { select: { name: true } } } },
        subjectGroups: { select: { subject: { select: { name: true } }, group: { select: { name: true } } } },
        assignedCaptains: { select: { captain: { select: { firstName: true, lastName: true, username: true } } } },
      },
    }),
    prisma.quizAttempt.findMany({
      where: { studentId: id, status: { in: ["COMPLETED", "FAILED"] }, ...attemptWhere },
      orderBy: { completedAt: "desc" },
      take: 20,
      select: {
        id: true,
        status: true,
        score: true,
        totalQuestions: true,
        tabSwitchCount: true,
        completedAt: true,
        homework: { select: { title: true, subject: { select: { name: true } } } },
      },
    }),
    prisma.studentNote.findMany({
      where: { studentId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        kind: true,
        body: true,
        authorName: true,
        authorRole: true,
        createdAt: true,
        followUpAt: true,
        followUpDoneAt: true,
        motivationFrom: true,
        motivationTo: true,
      },
    }),
  ]);
  if (!student) notFound();

  const stats = student.programId ? (await getProgramStudentStats(student.programId)).stats.get(id) : undefined;
  const level = motivationLevel(student.motivation);
  const name = `${student.firstName} ${student.lastName}`.trim();
  const addNote = addStudentNote.bind(null, id);
  const canWrite = can(staff, "notes.write");
  const hobbies = parseHobbies(student.hobby);

  return (
    <div className="sa-st">
      <nav className="sa-st-crumbs" aria-label="Breadcrumb">
        <Link href="/admin/my-students">My Students</Link>
        <span aria-hidden>/</span>
        <span>{name}</span>
      </nav>

      <header className="sa-st-head">
        <div>
          <h1>{name}</h1>
          <p>
            @{student.username} · {student.program?.name ?? "No program"}
            {student.cohortMembership ? ` · ${student.cohortMembership.cohort.name}` : ""}
          </p>
        </div>
      </header>

      <section className="sa-st-stats" aria-label="Progress">
        <div className="sa-st-stat">
          <span>ArenaPoints</span>
          <strong>{stats?.points ?? 0}</strong>
        </div>
        <div className="sa-st-stat">
          <span>Rank in program</span>
          <strong>{stats ? `#${stats.rank}` : "-"}</strong>
        </div>
        <div className="sa-st-stat">
          <span>Accuracy</span>
          <strong>{stats?.accuracy != null ? `${stats.accuracy}%` : "-"}</strong>
        </div>
        <div className="sa-st-stat">
          <span>Motivation</span>
          <strong>{level ? `${student.motivation}%` : "-"}</strong>
          {level && <small className={`sa-st-tone is-${level.tone}`}>{level.label}</small>}
        </div>
      </section>

      <div className="sa-st-layout">
        <div className="flex min-w-0 flex-col gap-5">
          {canWrite && (
            <form action={addNote} className="sa-st-section sa-st-noteform">
              <h2>Add a note</h2>
              {error && (
                <p className="sa-st-alert is-error" role="alert">
                  {error}
                </p>
              )}
              {search?.noted === "1" && (
                <p className="sa-st-alert is-ok" role="status">
                  Note added.
                </p>
              )}
              <div className="sa-st-grid">
                <label className="sa-st-field">
                  <span>Category</span>
                  <Select name="kind" className="sa-st-input" defaultValue="COMMENT">
                    {WRITABLE_NOTE_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {NOTE_META[k].title}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="sa-st-field">
                  <span>
                    Follow up on <em>optional</em>
                  </span>
                  <input type="date" name="followUpAt" className="sa-st-input" />
                </label>
              </div>
              <label className="sa-st-field">
                <span>Note</span>
                <textarea name="body" required maxLength={4000} rows={4} className="sa-st-input" placeholder="What happened, what was agreed, what's next…" />
              </label>
              <div className="sa-st-actions">
                <button type="submit" className="sa-st-primary">
                  Save note
                </button>
              </div>
            </form>
          )}

          <section className="sa-st-section">
            <h2>Notes &amp; follow-ups</h2>
            {notes.length === 0 && <p className="sa-st-empty">No notes yet.</p>}
            <ol className="sa-st-notes">
              {notes.map((n) => {
                const meta = NOTE_META[n.kind];
                const done = complete(n.id);
                return (
                  <li key={n.id} className="sa-st-note">
                    <div className="sa-st-note-head">
                      <span className={`sa-st-tag is-${meta.tone}`}>{meta.title}</span>
                      <span className="sa-st-muted">
                        {n.authorName} · {n.authorRole} · {fmt(n.createdAt)}
                      </span>
                    </div>
                    {n.kind === "MOTIVATION" && n.motivationTo != null ? (
                      <p>
                        Motivation {n.motivationFrom ?? "-"}% → {n.motivationTo}%
                        {n.body ? ` - ${n.body}` : ""}
                      </p>
                    ) : (
                      <p className="whitespace-pre-wrap">{n.body}</p>
                    )}
                    {n.followUpAt && (
                      <div className="sa-st-follow">
                        {n.followUpDoneAt ? (
                          <span className="sa-st-tone is-good">Follow-up done {fmt(n.followUpDoneAt).slice(0, 10)}</span>
                        ) : (
                          <>
                            <span className="sa-st-tone is-medium">Follow up by {n.followUpAt.toISOString().slice(0, 10)}</span>
                            {canWrite && (
                              <form action={done}>
                                <button type="submit" className="sa-st-link">
                                  Mark done
                                </button>
                              </form>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        <aside className="sa-st-side">
          <section className="sa-st-card">
            <h2>Subjects</h2>
            {student.subjectGroups.length === 0 ? (
              <p className="sa-st-muted">Not enrolled in any subject.</p>
            ) : (
              <ul className="sa-st-list">
                {student.subjectGroups.map((sg, i) => (
                  <li key={i}>
                    <span>{sg.subject.name}</span>
                    <small>{sg.group?.name ?? "No group"}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="sa-st-card">
            <h2>Recent quiz results</h2>
            {attempts.length === 0 ? (
              <p className="sa-st-muted">No finished quizzes yet.</p>
            ) : (
              <ul className="sa-st-list">
                {attempts.map((a) => (
                  <li key={a.id}>
                    <span className="min-w-0 truncate">{a.homework.title}</span>
                    <small>
                      {a.status === "FAILED" ? "Failed (anti-cheat)" : `${a.score}/${a.totalQuestions}`}
                      {a.tabSwitchCount > 0 && a.status !== "FAILED" ? ` · ${a.tabSwitchCount} tab switch` : ""}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="sa-st-card">
            <h2>About</h2>
            <dl className="sa-st-dl">
              <div>
                <dt>Communication</dt>
                <dd>{student.communicationSkill != null ? `${student.communicationSkill} / 5` : "-"}</dd>
              </div>
              <div>
                <dt>Hobbies</dt>
                <dd>{hobbies.length ? hobbies.join(", ") : "-"}</dd>
              </div>
              <div>
                <dt>Captain</dt>
                <dd>
                  {student.assignedCaptains.length
                    ? student.assignedCaptains.map((c) => `${c.captain.firstName} ${c.captain.lastName}`.trim() || c.captain.username).join(", ")
                    : "-"}
                </dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );

  function complete(noteId: string) {
    return completeFollowUp.bind(null, noteId);
  }
}
