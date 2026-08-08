import { getAdminEnv } from "@heyvera/config";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminSessionCookie, parseAdminSessionToken } from "./admin-session-token";

export async function requireAdmin(): Promise<{ username: string }> {
  const env = getAdminEnv();
  const token = (await cookies()).get(adminSessionCookie)?.value;
  const session = parseAdminSessionToken(token, env.SESSION_SECRET);
  if (!session || session.username !== env.ADMIN_USERNAME) redirect("/login");
  return { username: session.username };
}
