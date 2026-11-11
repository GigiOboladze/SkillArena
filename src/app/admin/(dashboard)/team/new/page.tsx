import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaffWith } from "@/lib/staff-guard";
import { createStaff } from "../actions";
import { loadStaffFormOptions } from "../options";
import { StaffForm } from "../StaffForm";

const ERRORS: Record<string, string> = {
  name: "Enter a first name.",
  username: "Usernames are 3-40 characters: letters, numbers, dot, dash or underscore.",
  taken: "That username is already in use.",
  role: "Pick a role.",
  program: "Pick a program.",
  weak: "Passwords must be at least 8 characters.",
};

export default async function NewStaffPage({ searchParams }: PageProps<"/admin/team/new">) {
  const superAdmin = await getStaffWith("staff.manage");
  if (!superAdmin) notFound();
  const search = await searchParams;
  const error = typeof search?.error === "string" ? ERRORS[search.error] : null;
  const options = await loadStaffFormOptions(false);

  return (
    <div className="sa-st">
      <nav className="sa-st-crumbs" aria-label="Breadcrumb">
        <Link href="/admin/team">Staff &amp; Access</Link>
        <span aria-hidden>/</span>
        <span>New staff account</span>
      </nav>
      <header className="sa-st-head">
        <div>
          <h1>New staff account</h1>
          <p>Choose a role - the assignments below change to match it.</p>
        </div>
      </header>
      {error && (
        <p className="sa-st-alert is-error" role="alert">
          {error}
        </p>
      )}
      {options.programs.length === 0 ? (
        <p className="sa-st-empty">Create a program first.</p>
      ) : (
        <StaffForm
          mode="create"
          action={createStaff}
          options={options}
          initial={{ firstName: "", lastName: "", username: "", role: "", programId: "", groupIds: [], studentIds: [], cohortIds: [], captainIds: [] }}
        />
      )}
    </div>
  );
}
