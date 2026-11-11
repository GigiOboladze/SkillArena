"use client";

import { Select } from "@/components/ui/Select";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { PasswordInput } from "@/components/PasswordInput";

export type StaffFormRole = "LECTURER" | "JUNIOR_CAPTAIN" | "MIDDLE_CAPTAIN" | "SENIOR_CAPTAIN" | "SUCCESS_MANAGER" | "ADMIN";

export type StaffFormOptions = {
  programs: { id: string; name: string }[];
  subjects: { id: string; name: string; programId: string; groups: { id: string; name: string }[] }[];
  students: { id: string; name: string; username: string; programId: string }[];
  cohorts: { id: string; name: string; programId: string; members: number }[];
  captains: { id: string; name: string; username: string; role: string; programId: string }[];
  roles: { value: StaffFormRole; label: string; description: string }[];
};

export type StaffFormInitial = {
  firstName: string;
  lastName: string;
  username: string;
  role: StaffFormRole | "";
  programId: string;
  groupIds: string[];
  studentIds: string[];
  cohortIds: string[];
  captainIds: string[];
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="sa-st-primary" disabled={pending} aria-busy={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}

function toggle(list: string[], id: string) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function StaffForm({
  mode,
  action,
  options,
  initial,
  selfId,
}: {
  mode: "create" | "edit";
  action: (formData: FormData) => void | Promise<void>;
  options: StaffFormOptions;
  initial: StaffFormInitial;
  selfId?: string;
}) {
  const [role, setRole] = useState<StaffFormRole | "">(initial.role);
  const [programId, setProgramId] = useState(initial.programId || options.programs[0]?.id || "");
  const [groupIds, setGroupIds] = useState(initial.groupIds);
  const [studentIds, setStudentIds] = useState(initial.studentIds);
  const [cohortIds, setCohortIds] = useState(initial.cohortIds);
  const [captainIds, setCaptainIds] = useState(initial.captainIds);
  const [studentQuery, setStudentQuery] = useState("");

  const subjects = options.subjects.filter((s) => s.programId === programId);
  const programStudents = options.students.filter((s) => s.programId === programId);
  const cohorts = options.cohorts.filter((c) => c.programId === programId);
  const captains = options.captains.filter((c) => c.programId === programId && c.id !== selfId);
  const visibleStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    const list = q
      ? programStudents.filter((s) => s.name.toLowerCase().includes(q) || s.username.includes(q))
      : programStudents;
    return list.slice(0, 200);
  }, [programStudents, studentQuery]);

  // Only the selections that belong to the current program are submitted.
  const validGroups = new Set(subjects.flatMap((s) => s.groups.map((g) => g.id)));
  const validStudents = new Set(programStudents.map((s) => s.id));
  const validCohorts = new Set(cohorts.map((c) => c.id));
  const validCaptains = new Set(captains.map((c) => c.id));

  return (
    <form action={action} className="sa-st-form">
      <fieldset className="sa-st-section">
        <legend>Account</legend>
        <div className="sa-st-grid">
          <label className="sa-st-field">
            <span>First name</span>
            <input name="firstName" required maxLength={60} defaultValue={initial.firstName} className="sa-st-input" />
          </label>
          <label className="sa-st-field">
            <span>Last name</span>
            <input name="lastName" maxLength={60} defaultValue={initial.lastName} className="sa-st-input" />
          </label>
          <label className="sa-st-field">
            <span>Username</span>
            {mode === "create" ? (
              <input
                name="username"
                required
                pattern="[a-zA-Z0-9._\-]{3,40}"
                title="3-40 characters: letters, numbers, dot, dash or underscore"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                defaultValue={initial.username}
                className="sa-st-input"
              />
            ) : (
              <input value={initial.username} readOnly disabled className="sa-st-input" />
            )}
          </label>
          {mode === "create" && (
            <label className="sa-st-field">
              <span>Password <em>optional</em></span>
              <PasswordInput name="password" minLength={8} className="sa-st-input" placeholder="Leave empty to generate one" />
            </label>
          )}
        </div>
      </fieldset>

      <fieldset className="sa-st-section">
        <legend>Role</legend>
        <div className="sa-st-roles" role="radiogroup">
          {options.roles.map((r) => (
            <label key={r.value} className={`sa-st-role ${role === r.value ? "is-on" : ""}`}>
              <input
                type="radio"
                name="role"
                value={r.value}
                checked={role === r.value}
                onChange={() => setRole(r.value)}
                required
              />
              <strong>{r.label}</strong>
              <small>{r.description}</small>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="sa-st-section">
        <legend>Program</legend>
        <label className="sa-st-field sa-st-field-narrow">
          <span>Every staff account works inside one program.</span>
          <Select name="programId" value={programId} onChange={(e) => setProgramId(e.target.value)} className="sa-st-input" required>
            {options.programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </label>
      </fieldset>

      {role && role !== "ADMIN" && (
        <fieldset className="sa-st-section">
          <legend>Assignments</legend>

          {role === "LECTURER" && (
            <div className="flex flex-col gap-3">
              <p className="sa-st-hint">Pick every subject group this lecturer teaches.</p>
              {subjects.length === 0 && <p className="sa-st-empty">This program has no subjects yet.</p>}
              {subjects.map((s) => (
                <div key={s.id} className="sa-st-subject">
                  <span className="sa-st-subject-name">{s.name}</span>
                  <div className="flex flex-wrap gap-2">
                    {s.groups.map((g) => (
                      <label key={g.id} className={`sa-st-chip ${groupIds.includes(g.id) ? "is-on" : ""}`}>
                        <input
                          type="checkbox"
                          checked={groupIds.includes(g.id)}
                          onChange={() => setGroupIds((l) => toggle(l, g.id))}
                          aria-label={`${s.name} - ${g.name}`}
                        />
                        {g.name}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {groupIds.filter((id) => validGroups.has(id)).map((id) => (
                <input key={id} type="hidden" name="groupIds" value={id} />
              ))}
            </div>
          )}

          {role === "JUNIOR_CAPTAIN" && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="sa-st-hint">
                  Students this captain looks after.{" "}
                  <strong>{studentIds.filter((id) => validStudents.has(id)).length} selected</strong>
                </p>
                <input
                  type="search"
                  value={studentQuery}
                  onChange={(e) => setStudentQuery(e.target.value)}
                  placeholder="Search students"
                  aria-label="Search students"
                  className="sa-st-input sa-st-search"
                />
              </div>
              {programStudents.length === 0 ? (
                <p className="sa-st-empty">No students in this program yet.</p>
              ) : (
                <div className="sa-st-checklist">
                  {visibleStudents.map((s) => (
                    <label key={s.id} className="sa-st-check">
                      <input type="checkbox" checked={studentIds.includes(s.id)} onChange={() => setStudentIds((l) => toggle(l, s.id))} />
                      <span>{s.name}</span>
                      <small>@{s.username}</small>
                    </label>
                  ))}
                  {visibleStudents.length === 0 && <p className="sa-st-empty">No match.</p>}
                </div>
              )}
              {studentIds.filter((id) => validStudents.has(id)).map((id) => (
                <input key={id} type="hidden" name="studentIds" value={id} />
              ))}
            </div>
          )}

          {role === "MIDDLE_CAPTAIN" && (
            <div className="flex flex-col gap-3">
              <p className="sa-st-hint">The cohort(s) this captain runs. Cohorts are managed under Cohorts, not subject groups.</p>
              {cohorts.length === 0 && (
                <p className="sa-st-empty">
                  No cohorts in this program yet. <Link href={`/admin/cohorts?program=${programId}`}>Create one</Link> first.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {cohorts.map((c) => (
                  <label key={c.id} className={`sa-st-chip ${cohortIds.includes(c.id) ? "is-on" : ""}`}>
                    <input type="checkbox" checked={cohortIds.includes(c.id)} onChange={() => setCohortIds((l) => toggle(l, c.id))} />
                    {c.name} <small>{c.members} students</small>
                  </label>
                ))}
              </div>
              {cohortIds.filter((id) => validCohorts.has(id)).map((id) => (
                <input key={id} type="hidden" name="cohortIds" value={id} />
              ))}
            </div>
          )}

          {role === "SENIOR_CAPTAIN" && (
            <div className="flex flex-col gap-3">
              <p className="sa-st-hint">Junior and Middle Captains this captain supervises. Supervision gives no account administration.</p>
              {captains.length === 0 && <p className="sa-st-empty">No Junior or Middle Captains in this program yet.</p>}
              <div className="sa-st-checklist">
                {captains.map((c) => (
                  <label key={c.id} className="sa-st-check">
                    <input type="checkbox" checked={captainIds.includes(c.id)} onChange={() => setCaptainIds((l) => toggle(l, c.id))} />
                    <span>{c.name}</span>
                    <small>{c.role === "JUNIOR_CAPTAIN" ? "Junior Captain" : "Middle Captain"} · @{c.username}</small>
                  </label>
                ))}
              </div>
              {captainIds.filter((id) => validCaptains.has(id)).map((id) => (
                <input key={id} type="hidden" name="captainIds" value={id} />
              ))}
            </div>
          )}

          {role === "SUCCESS_MANAGER" && (
            <p className="sa-st-hint">
              A Success Manager sees every student, note, INCO message and statistic in the program above - and nothing from any
              other program.
            </p>
          )}
        </fieldset>
      )}

      <div className="sa-st-actions">
        <Link href="/admin/team" className="sa-st-ghost">
          Cancel
        </Link>
        <Submit label={mode === "create" ? "Create staff account" : "Save changes"} />
      </div>
    </form>
  );
}
