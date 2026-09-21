"use server";

import { redirect } from "next/navigation";
import { destroyStudentUserSession } from "@/lib/session";

export async function logout() {
  await destroyStudentUserSession();
  redirect("/login");
}
