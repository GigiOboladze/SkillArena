"use client";

import { useRef } from "react";

type Group = { id: string; name: string };

/**
 * Target-group picker: one pill per group of the quiz's subject. A chosen
 * pill turns violet, and every click saves straight away (the whole current
 * selection is posted, so quick successive clicks can't lose a change).
 */
export function QuizTargetingForm({
  action,
  subjectId,
  groups,
  currentGroupIds,
}: {
  action: (formData: FormData) => void | Promise<void>;
  subjectId: string;
  groups: Group[];
  currentGroupIds: string[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const current = new Set(currentGroupIds);

  return (
    <form ref={formRef} action={action}>
      <input type="hidden" name="subjectId" value={subjectId} />
      <div className="sa-qd-groups">
        {groups.map((g) => (
          <label key={g.id} className="sa-qd-group">
            <input
              type="checkbox"
              name="groupIds"
              value={g.id}
              defaultChecked={current.has(g.id)}
              onChange={() => formRef.current?.requestSubmit()}
            />
            <span>{g.name}</span>
          </label>
        ))}
        {groups.length === 0 && <p className="col-span-full text-sm text-rahoot-muted">This subject has no groups yet.</p>}
      </div>
    </form>
  );
}
