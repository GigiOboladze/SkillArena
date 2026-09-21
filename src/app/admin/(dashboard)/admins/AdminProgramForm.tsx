"use client";

export function AdminProgramForm({
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
      className="flex items-center gap-2"
      onSubmit={(e) => {
        const select = e.currentTarget.elements.namedItem("programId") as HTMLSelectElement;
        if (select.value === currentProgramId) {
          e.preventDefault();
          return;
        }
        if (!window.confirm("Change this admin's program? They'll immediately lose access to the previous one.")) {
          e.preventDefault();
        }
      }}
    >
      <select name="programId" defaultValue={currentProgramId ?? ""} className="input !w-auto !py-1.5 text-sm">
        {programs.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button type="submit" className="btn btn-outline !py-1.5 !px-3 text-sm">
        Change
      </button>
    </form>
  );
}
