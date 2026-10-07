"use server";

import { redirect } from "next/navigation";

export async function goToHootPin(formData: FormData) {
  const raw = String(formData.get("pin") || "").trim();
  if (!/^\d{6}$/.test(raw)) {
    redirect("/hootarena?error=empty");
  }
  redirect(`/hootarena/join/${raw}`);
}
