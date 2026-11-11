import { Select } from "@/components/ui/Select";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentAdmin } from "@/lib/session";
import { MAX_DESCRIPTION_LENGTH } from "@/lib/bug-reports";
import { BUG_PRIORITY, type BugPriorityKey } from "@/lib/bug-report-meta";
import { BugReportScreenshotInput } from "@/app/dashboard/bug-reports/new/BugReportScreenshotInput";
import { IconBugSolid } from "@/components/admin/BugIcons";
import { createAdminBugReport } from "../actions";

const ERRORS: Record<string, string> = {
  description: `Describe the bug (up to ${MAX_DESCRIPTION_LENGTH} characters).`,
  toomany: "Attach at most 2 screenshots.",
  size: "Each screenshot must be 3 MB or smaller.",
  filetype: "Only PNG, JPEG, GIF or WebP images can be attached.",
};

export default async function AdminNewBugReportPage({ searchParams }: PageProps<"/admin/bug-reports/new">) {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();
  const search = await searchParams;
  const error = typeof search?.error === "string" ? ERRORS[search.error] ?? null : null;

  return (
    <div className="sa-br mx-auto flex w-full max-w-2xl flex-col gap-5">
      <Link href="/admin/bug-reports" className="sa-mp-back self-start">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
        Back to bug reports
      </Link>
      <div className="flex items-center gap-4">
        <span className="sa-br-head-icon !static" aria-hidden>
          <IconBugSolid className="h-8 w-8" />
        </span>
        <div>
          <h1 className="text-3xl font-black tracking-tight">Report a Bug</h1>
          <p className="mt-0.5 text-rahoot-muted">Describe what went wrong so the team can fix it.</p>
        </div>
      </div>

      <form action={createAdminBugReport} className="sa-br-panel flex flex-col gap-5">
        <label className="sa-mp-field">
          <span>What happened?</span>
          <textarea
            name="description"
            required
            maxLength={MAX_DESCRIPTION_LENGTH}
            rows={6}
            placeholder="Steps to reproduce, what you expected, and what happened instead..."
            className="sa-br-textarea"
          />
        </label>
        <label className="sa-mp-field">
          <span>Priority</span>
          <Select name="priority" defaultValue="MEDIUM" className="sa-br-select !w-full">
            {(Object.keys(BUG_PRIORITY) as BugPriorityKey[]).map((p) => (
              <option key={p} value={p}>
                {BUG_PRIORITY[p].label}
              </option>
            ))}
          </Select>
        </label>
        <div className="sa-mp-field">
          <span>Screenshots (optional)</span>
          <BugReportScreenshotInput />
        </div>
        {error && (
          <p role="alert" className="text-sm font-medium text-rahoot-red">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Link href="/admin/bug-reports" className="sa-br-view">
            Cancel
          </Link>
          <button type="submit" className="sa-br-primary">
            Submit Report
          </button>
        </div>
      </form>
    </div>
  );
}
