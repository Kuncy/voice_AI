import { getAdminEnv } from "@heyvera/config";
import type { NextRequest } from "next/server";
import { appRedirect } from "@/lib/app-redirect";
import { adminSessionCookie } from "@/lib/admin-session-token";

export async function POST(_request: NextRequest) {
  const response = appRedirect(getAdminEnv().APP_URL, "/login", 303);
  response.cookies.delete(adminSessionCookie);
  return response;
}
