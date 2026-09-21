"use client";

/**
 * Admin-entered (not auto-generated) password reset, used from the student
 * detail page. A plain client-side confirm() gate before submit, matching
 * DeleteStudentButton's existing pattern for a destructive/sensitive action -
 * the real validation (length, match) is re-checked server-side in
 * setStudentPassword regardless of what this component allows through.
 */
export function SetPasswordForm({
  action,
  studentName,
}: {
  action: (formData: FormData) => void;
  studentName: string;
}) {
  return (
    <form
      action={action}
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        const form = e.currentTarget;
        const password = (form.elements.namedItem("password") as HTMLInputElement).value;
        const confirm = (form.elements.namedItem("confirmPassword") as HTMLInputElement).value;
        if (password !== confirm) {
          e.preventDefault();
          window.alert("Passwords do not match.");
          return;
        }
        if (!window.confirm(`Set a new password for ${studentName}? They'll be signed out everywhere immediately.`)) {
          e.preventDefault();
        }
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          New password
          <input type="password" name="password" required minLength={8} className="input mt-1" />
        </label>
        <label className="text-sm font-semibold">
          Confirm new password
          <input type="password" name="confirmPassword" required minLength={8} className="input mt-1" />
        </label>
      </div>
      <button type="submit" className="btn btn-primary self-start">
        Set new password
      </button>
    </form>
  );
}
