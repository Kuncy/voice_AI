import { getAdminEnv } from "@heyvera/config";
import { type NextRequest, NextResponse } from "next/server";
import { appRedirect } from "@/lib/app-redirect";
import { hasAdminSession } from "@/lib/admin-request";

export function authorizeAdminRequest(request: NextRequest, env = getAdminEnv()): NextResponse {
  if (hasAdminSession(request, env)) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/voice-sessions")) {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  return appRedirect(env.APP_URL, "/login");
}

export function proxy(request: NextRequest) {
  return authorizeAdminRequest(request);
}

export const config = {
  matcher: ["/", "/conversations/:path*", "/requests/:path*", "/settings/:path*", "/api/voice-sessions/:path*"],
};
