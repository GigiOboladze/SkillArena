"use server";

import { redirect } from "next/navigation";
import { destroyAdminSession } from "@/lib/session";

export async function logout() {
  await destroyAdminSession();
  redirect("/login");
}
