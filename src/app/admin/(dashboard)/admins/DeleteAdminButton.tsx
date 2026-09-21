"use client";

export function DeleteAdminButton({ username }: { username: string }) {
  return (
    <button
      type="submit"
      className="btn btn-outline !py-1.5 !px-3 text-sm"
      onClick={(e) => {
        if (!window.confirm(`Remove admin "${username}"?`)) {
          e.preventDefault();
        }
      }}
    >
      Remove
    </button>
  );
}
