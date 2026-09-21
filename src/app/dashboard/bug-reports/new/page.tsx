import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStudent } from "@/lib/session";
import { submitBugReport } from "../actions";
import { BugReportScreenshotInput } from "./BugReportScreenshotInput";

const ERROR_MESSAGES: Record<string, string> = {
  description: "Please describe the problem.",
  toomany: "You can upload at most 2 screenshots.",
  size: "Each screenshot must be 3MB or smaller.",
  filetype: "Unsupported file - please upload a PNG, JPEG, GIF, or WEBP image.",
};

export default async function NewBugReportPage({
  searchParams,
}: PageProps<"/dashboard/bug-reports/new">) {
  const student = await getCurrentStudent();
  if (!student) redirect("/login");

  const search = await searchParams;
  const error = typeof search?.error === "string" ? ERROR_MESSAGES[search.error] ?? null : null;

  return (
    <div className="mx-auto max-w-lg">
      <Link href="/dashboard/bug-reports" className="text-sm text-rahoot-red hover:underline">
        &larr; Back to bug reports
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Report a Bug</h1>
      <p className="mt-1 text-sm text-rahoot-muted">Tell us what went wrong. Your description is required.</p>

      <form action={submitBugReport} className="card mt-6 flex flex-col gap-4 p-6">
        <label className="text-sm font-semibold">
          Description
          <textarea
            name="description"
            required
            maxLength={2000}
            rows={5}
            placeholder="Describe the problem..."
            className="input mt-1"
            autoFocus
          />
        </label>

        <div>
          <p className="text-sm font-semibold">Screenshot (optional)</p>
          <div className="mt-1">
            <BugReportScreenshotInput />
          </div>
        </div>

        {error && <p className="text-sm font-medium text-rahoot-red">{error}</p>}

        <div className="flex justify-end gap-2">
          <Link href="/dashboard/bug-reports" className="btn btn-outline">
            Cancel
          </Link>
          <button type="submit" className="btn btn-primary">
            Submit Report
          </button>
        </div>
      </form>
    </div>
  );
}
