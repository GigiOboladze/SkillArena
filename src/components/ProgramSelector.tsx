"use client";

/**
 * Program switcher shown only to the Super Admin (a regular Admin is always
 * scoped to their own program - see resolveAdminProgramScope - and never
 * sees this control at all). A plain GET form so the choice is a real,
 * bookmarkable/shareable URL (`?program=<id>`) like every other filter in
 * the admin UI, auto-submitting on change so switching feels like a tab
 * rather than a filter you have to confirm.
 */
export function ProgramSelector({
  programs,
  currentProgramId,
  basePath,
}: {
  programs: { id: string; name: string }[];
  currentProgramId: string;
  basePath: string;
}) {
  if (programs.length <= 1) return null;

  return (
    <form method="get" action={basePath}>
      <label className="flex items-center gap-2 text-sm font-semibold">
        Program
        <select
          name="program"
          defaultValue={currentProgramId}
          className="input !w-auto !py-1.5"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}
