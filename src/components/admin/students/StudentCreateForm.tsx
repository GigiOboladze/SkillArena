"use client";

import { useState } from "react";
import Link from "next/link";
import { PasswordInput } from "@/components/PasswordInput";
import { SubjectAssignmentPicker } from "./SubjectAssignmentPicker";
import { StarRatingInput } from "./StarRatingInput";

type Program = { id: string; name: string; subjects: { id: string; name: string; groups: { id: string; name: string }[] }[] };

export function StudentCreateForm({
  action,
  programs,
  defaultProgramId,
  canChooseProgram,
  error,
}: {
  action: (formData: FormData) => void | Promise<void>;
  programs: Program[];
  defaultProgramId: string;
  canChooseProgram: boolean;
  error: string | null;
}) {
  const [programId, setProgramId] = useState(defaultProgramId);
  const program = programs.find((p) => p.id === programId) ?? programs[0];

  return (
    <form action={action} className="flex flex-col gap-4">
      <section className="sa-sc-card grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
        <label className="sa-sc-label">
          <span>
            First name <em>*</em>
          </span>
          <input name="firstName" required maxLength={80} placeholder="e.g. Giorgi" className="sa-sc-input" />
        </label>
        <label className="sa-sc-label">
          <span>
            Last name <em>*</em>
          </span>
          <input name="lastName" required maxLength={80} placeholder="e.g. Kapanadze" className="sa-sc-input" />
        </label>
        <label className="sa-sc-label">
          <span>
            Username <em>*</em>
          </span>
          <input name="username" required maxLength={40} autoCapitalize="off" placeholder="e.g. gkapanadze" className="sa-sc-input" />
        </label>
        <label className="sa-sc-label">
          <span>Password</span>
          <PasswordInput name="password" placeholder="Leave blank to auto-generate" className="sa-sc-input" ariaLabel="Password" />
        </label>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="sa-sc-card flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <span className="sa-sc-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                <path d="M7 7.5h10a4.5 4.5 0 0 1 4.4 5.5l-.8 3.6a2.4 2.4 0 0 1-4.1 1.1L14.8 16H9.2l-1.7 1.7a2.4 2.4 0 0 1-4.1-1.1L2.6 13A4.5 4.5 0 0 1 7 7.5Z" />
                <path d="M8 10.5v3M6.5 12h3M15.5 11h.01M17.5 13h.01" />
              </svg>
            </span>
            <label className="sa-sc-label flex-1">
              <span>
                Hobby <small>(optional - can be added later)</small>
              </span>
              <input name="hobby" maxLength={220} placeholder="e.g. Gaming, Music, Football (comma-separated)" className="sa-sc-input" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span className="sa-sc-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" className="h-6 w-6">
                <circle cx="9" cy="8.5" r="3.25" />
                <path d="M2.75 19.5a6.25 6.25 0 0 1 12.5 0M15.5 5.6a3.25 3.25 0 0 1 0 5.8M17.5 13.6a6.2 6.2 0 0 1 3.75 5.9" />
              </svg>
            </span>
            <span className="flex-1 font-semibold">
              Communication skill <small className="font-normal text-rahoot-muted">(optional)</small>
            </span>
            <StarRatingInput />
          </div>
        </section>

        <section className="sa-sc-card flex items-start gap-4">
          <span className="sa-sc-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
              <path d="m12 4 8.5 4.5L12 13 3.5 8.5 12 4Z" />
              <path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5" />
            </svg>
          </span>
          <label className="sa-sc-label flex-1">
            <span>
              Program <em>*</em>
            </span>
            {canChooseProgram ? (
              <select
                name="programId"
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
                className="sa-sc-input font-semibold"
              >
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input type="hidden" name="programId" value={program?.id ?? ""} />
                <span className="sa-sc-input flex items-center font-semibold">{program?.name}</span>
              </>
            )}
          </label>
        </section>
      </div>

      <section className="sa-sc-card">
        <h2 className="mb-4 flex items-center gap-3 text-lg font-bold">
          <span className="sa-sc-icon !h-10 !w-10" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M3.5 5.5h6a2.5 2.5 0 0 1 2.5 2.5v11a2 2 0 0 0-2-2H3.5v-11.5ZM20.5 5.5h-6A2.5 2.5 0 0 0 12 8v11a2 2 0 0 1 2-2h6.5V5.5Z" />
            </svg>
          </span>
          Subject &amp; Group Assignments
        </h2>
        {/* key: switching program swaps in that program's subjects with a fresh selection */}
        <SubjectAssignmentPicker key={program?.id} subjects={program?.subjects ?? []} />
      </section>

      {error && <p className="text-sm font-medium text-rahoot-red">{error}</p>}

      <div className="flex flex-wrap justify-end gap-3">
        <Link href="/admin/students" className="sa-sc-cancel">
          Cancel
        </Link>
        <button type="submit" className="sa-sc-submit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className="h-5 w-5" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Create student
        </button>
      </div>
    </form>
  );
}
