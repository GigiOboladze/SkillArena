type SubjectWithGroups = {
  id: string;
  name: string;
  groups: { id: string; name: string }[];
};

// Sentinel for "not assigned to this subject at all" - distinct from "" (a
// real submitted value meaning "assigned to this subject, no group yet"),
// which the plain None pill used to double as before subject assignment
// without a group existed as its own concept. Kept out of the group id
// alphabet space (cuids never look like this) so it can never collide with
// a real group id.
const UNASSIGNED = "__unassigned__";

/**
 * The subject -> group assignment table shown on both "create student" and
 * "edit student". Each subject gets a compact row of pill-style toggle
 * buttons (one real radio input per option, visually hidden, styled via its
 * label) submitted as `group_<subjectId>` - server actions read those
 * fields directly by name. Native radio inputs (not a client-side JS
 * toggle) keep keyboard nav, focus rings, and "which one is selected" all
 * working for free, with no JS needed at all.
 *
 * Three states per subject, not two: "not assigned" (UNASSIGNED - no row
 * created at all), "assigned, no group yet" (value "" - a real row with a
 * null group, see StudentSubjectGroup's schema comment), and "assigned to
 * Group N".
 */
export function SubjectGroupFields({
  subjects,
  currentAssignments = {},
}: {
  subjects: SubjectWithGroups[];
  // Key present with value null = assigned, no group yet. Key present with
  // a group id = assigned to that group. Key absent = not assigned.
  currentAssignments?: Record<string, string | null>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold">Subject / group assignments</p>
      <div className="flex flex-col gap-3">
        {subjects.map((subject) => {
          const assigned = subject.id in currentAssignments;
          const current = assigned ? currentAssignments[subject.id] ?? "" : UNASSIGNED;
          return (
            <div key={subject.id} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
              <span className="text-sm font-medium sm:w-44 sm:shrink-0">{subject.name}</span>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`${subject.name} group`}>
                <label className="group-pill">
                  <input
                    type="radio"
                    name={`group_${subject.id}`}
                    value={UNASSIGNED}
                    defaultChecked={current === UNASSIGNED}
                  />
                  <span>Not assigned</span>
                </label>
                <label className="group-pill">
                  <input type="radio" name={`group_${subject.id}`} value="" defaultChecked={current === ""} />
                  <span>No group yet</span>
                </label>
                {subject.groups.map((g) => (
                  <label key={g.id} className="group-pill">
                    <input
                      type="radio"
                      name={`group_${subject.id}`}
                      value={g.id}
                      defaultChecked={current === g.id}
                    />
                    <span>{g.name.replace(/^Group /, "")}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-rahoot-muted">
        A student only sees quizzes for subjects where they have a group assigned. "No group yet" shows the subject
        to the student with a message, but no quizzes.
      </p>
    </div>
  );
}
