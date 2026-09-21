"use server";

import { redirect } from "next/navigation";
import { verifyStudentCredentials, createStudentUserSession } from "@/lib/session";

export async function login(formData: FormData) {
  const username = String(formData.get("username") || "");
  const password = String(formData.get("password") || "");
  const from = String(formData.get("from") || "/dashboard");

  const student = await verifyStudentCredentials(username, password);
  if (!student) {
    const url = new URL("/login", "http://internal");
    url.searchParams.set("error", "invalid");
    if (from && from !== "/dashboard") url.searchParams.set("from", from);
    redirect(url.pathname + url.search);
  }

  await createStudentUserSession(student.id, student.username, student.sessionVersion);
  redirect(from.startsWith("/dashboard") || from.startsWith("/quiz") ? from : "/dashboard");
}
