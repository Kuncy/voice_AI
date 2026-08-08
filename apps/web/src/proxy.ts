import { getAdminEnv } from "@heyvera/config";
import { type NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, parseAdminSessionToken } from "@/lib/admin-session-token";

export function proxy(request: NextRequest) {
  const env = getAdminEnv();
  const session = parseAdminSessionToken(request.cookies.get(adminSessionCookie)?.value, env.SESSION_SECRET);
  if (session?.username === env.ADMIN_USERNAME) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/conversations/:path*", "/requests/:path*", "/settings/:path*"],
};
