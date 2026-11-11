import "server-only";
import { getCurrentStaff } from "@/lib/session";
import { can, type Capability } from "@/lib/authz";
import type { User } from "@/generated/prisma/client";

/** The current staff member if (and only if) their role has `capability`; otherwise null. */
export async function getStaffWith(capability: Capability): Promise<User | null> {
  const staff = await getCurrentStaff();
  return staff && can(staff, capability) ? staff : null;
}
