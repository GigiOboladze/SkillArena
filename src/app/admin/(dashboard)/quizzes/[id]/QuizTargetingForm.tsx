"use client";

import { useState } from "react";

type SubjectWithGroups = {
  id: string;
  name: string;
  groups: { id: string; name: string }[];
};

export function QuizTargetingForm({
  action,
  subjects,
  currentSubjectId,
  currentGroupIds,
}: {
  action: (formData: FormData) => void | Promise<void>;
  subjects: SubjectWithGroups[];
  currentSubjectId: string | null;
  currentGroupIds: string[];
}) {
  const [subjectId, setSubjectId] = useState(currentSubjectId ?? subjects[0]?.id ?? "");
  const selectedSubject = subjects.find((s) => s.id === subjectId);
  const currentGroupSet = new Set(currentGroupIds);

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="text-sm font-semibold">
        Subject
        <select
          name="subjectId"
          required
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          className="input mt-1"
        >
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend className="text-sm font-semibold">
          Target groups <span className="font-normal text-rahoot-muted">- students in any checked group can see this quiz</span>
        </legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(selectedSubject?.groups ?? []).map((g) => (
            <label
              key={g.id}
              className="flex items-center gap-2 rounded-lg border border-rahoot-border p-2 text-sm has-[:checked]:border-rahoot-red"
            >
              <input
                type="checkbox"
                name="groupIds"
                value={g.id}
                defaultChecked={subjectId === currentSubjectId && currentGroupSet.has(g.id)}
              />
              {g.name}
            </label>
          ))}
          {selectedSubject && selectedSubject.groups.length === 0 && (
            <p className="col-span-full text-sm text-rahoot-muted">This subject has no groups yet.</p>
          )}
        </div>
      </fieldset>

      <button type="submit" className="btn btn-outline self-start">
        Save subject &amp; groups
      </button>
    </form>
  );
}
