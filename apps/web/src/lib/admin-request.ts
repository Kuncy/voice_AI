import { type AdminEnv, getAdminEnv } from "@heyvera/config";
import { type NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, parseAdminSessionToken } from "./admin-session-token";

type AdminSessionEnv = Pick<AdminEnv, "ADMIN_USERNAME" | "SESSION_SECRET">;

export function hasAdminSession(request: NextRequest, env: AdminSessionEnv): boolean {
  const session = parseAdminSessionToken(request.cookies.get(adminSessionCookie)?.value, env.SESSION_SECRET);
  return session?.username === env.ADMIN_USERNAME;
}

export function requireAdminApi(request: NextRequest): NextResponse | undefined {
  if (hasAdminSession(request, getAdminEnv())) return undefined;
  return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
}
