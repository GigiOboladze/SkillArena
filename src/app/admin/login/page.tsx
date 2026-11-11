import { redirect } from "next/navigation";

// There is one login for every role now. Old bookmarks and links to
// /admin/login land on it, keeping any message and the original destination.
export default async function AdminLoginRedirect({ searchParams }: PageProps<"/admin/login">) {
  const params = await searchParams;
  const next = new URLSearchParams();
  for (const key of ["from", "error", "passwordChanged"]) {
    const value = params?.[key];
    if (typeof value === "string") next.set(key, value);
  }
  const qs = next.toString();
  redirect(qs ? `/login?${qs}` : "/login");
}
