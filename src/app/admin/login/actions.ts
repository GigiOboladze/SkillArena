"use server";

import { redirect } from "next/navigation";
import { verifyAdminCredentials, createAdminSession } from "@/lib/session";

export async function login(formData: FormData) {
  const username = String(formData.get("username") || "");
  const password = String(formData.get("password") || "");
  const from = String(formData.get("from") || "/admin");

  const admin = await verifyAdminCredentials(username, password);
  if (!admin) {
    const url = new URL("/admin/login", "http://internal");
    url.searchParams.set("error", "invalid");
    if (from && from !== "/admin") url.searchParams.set("from", from);
    redirect(url.pathname + url.search);
  }

  await createAdminSession(admin.id, admin.username, admin.sessionVersion);
  redirect(from.startsWith("/admin") ? from : "/admin");
}
