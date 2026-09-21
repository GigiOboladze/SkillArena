"use client";

export function ChangeProgramForm({
  action,
  programs,
  currentProgramId,
}: {
  action: (formData: FormData) => void;
  programs: { id: string; name: string }[];
  currentProgramId: string | null;
}) {
  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        const select = e.currentTarget.elements.namedItem("programId") as HTMLSelectElement;
        if (select.value === currentProgramId) {
          e.preventDefault();
          return;
        }
        if (
          !window.confirm(
            "Change this student's program? Their current subject/group assignments will be cleared - quiz history and scores are kept."
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <label className="text-sm font-semibold">
        Program
        <select name="programId" defaultValue={currentProgramId ?? ""} className="input mt-1">
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn btn-outline">
        Change program
      </button>
    </form>
  );
}
