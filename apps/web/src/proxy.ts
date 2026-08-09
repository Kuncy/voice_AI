import { getAdminEnv } from "@heyvera/config";
import { type NextRequest, NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/admin-request";

export function authorizeAdminRequest(request: NextRequest, env = getAdminEnv()): NextResponse {
  if (hasAdminSession(request, env)) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/voice-sessions")) {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export function proxy(request: NextRequest) {
  return authorizeAdminRequest(request);
}

export const config = {
  matcher: ["/", "/conversations/:path*", "/requests/:path*", "/settings/:path*", "/api/voice-sessions/:path*"],
};
