import { redirect } from "next/navigation";

// Admin Management became Staff & Access Management.
export default function AdminsRedirect() {
  redirect("/admin/team");
}
