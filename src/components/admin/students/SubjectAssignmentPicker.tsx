"use client";

import { useState } from "react";

type Subject = { id: string; name: string; groups: { id: string; name: string }[] };

/**
 * Subject & group assignment grid: tick a subject to assign it, and pick
 * its group (I, II, III...). Picking a group ticks the subject; clicking the
 * chosen group again clears it ("assigned, no group yet"). Posts
 * `sg_mode=picker`, `assign_<subjectId>` and `group_<subjectId>` - see
 * parseSubjectGroupAssignments.
 */
export function SubjectAssignmentPicker({
  subjects,
  currentAssignments = {},
}: {
  subjects: Subject[];
  currentAssignments?: Record<string, string | null>;
}) {
  const [state, setState] = useState<Record<string, { assigned: boolean; groupId: string | null }>>(() =>
    Object.fromEntries(
      subjects.map((s) => [s.id, { assigned: s.id in currentAssignments, groupId: currentAssignments[s.id] ?? null }])
    )
  );

  if (subjects.length === 0) {
    return <p className="text-sm text-rahoot-muted">This program has no subjects yet.</p>;
  }

  return (
    <div className="sa-assign-grid">
      <input type="hidden" name="sg_mode" value="picker" />
      {subjects.map((subject) => {
        const s = state[subject.id] ?? { assigned: false, groupId: null };
        return (
          <div key={subject.id} className={s.assigned ? "sa-assign is-on" : "sa-assign"}>
            <label className="sa-assign-subject">
              <input
                type="checkbox"
                name={`assign_${subject.id}`}
                checked={s.assigned}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    [subject.id]: { assigned: e.target.checked, groupId: e.target.checked ? s.groupId : null },
                  }))
                }
              />
              <span>{subject.name}</span>
            </label>
            <div className="sa-assign-groups" role="radiogroup" aria-label={`${subject.name} group`}>
              {subject.groups.map((g) => {
                const short = g.name.replace(/^Group /, "");
                return (
                  <label key={g.id} className="sa-assign-group" title={g.name}>
                    <input
                      type="radio"
                      name={`group_${subject.id}`}
                      value={g.id}
                      checked={s.groupId === g.id}
                      onChange={() => setState((prev) => ({ ...prev, [subject.id]: { assigned: true, groupId: g.id } }))}
                      onClick={() => {
                        if (s.groupId === g.id) {
                          setState((prev) => ({ ...prev, [subject.id]: { assigned: true, groupId: null } }));
                        }
                      }}
                    />
                    <span>{short}</span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
