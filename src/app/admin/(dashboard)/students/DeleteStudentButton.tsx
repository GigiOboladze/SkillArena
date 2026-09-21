"use client";

export function DeleteStudentButton({ name }: { name: string }) {
  return (
    <button
      type="submit"
      className="btn btn-outline !py-1.5 !px-3 text-sm"
      onClick={(e) => {
        if (!window.confirm(`Delete ${name}'s account permanently? Their quiz attempts/scores go with it.`)) {
          e.preventDefault();
        }
      }}
    >
      Delete
    </button>
  );
}
