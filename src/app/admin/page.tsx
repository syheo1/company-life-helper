import { cookies } from "next/headers";

import AdminConsole from "@/components/admin/admin-console";
import { SESSION_COOKIE_KEYS } from "@/lib/session";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const role = cookieStore.get(SESSION_COOKIE_KEYS.role)?.value ?? "unknown";
  const teamId = cookieStore.get(SESSION_COOKIE_KEYS.teamId)?.value ?? "";

  return <AdminConsole role={role} teamId={teamId} />;
}
