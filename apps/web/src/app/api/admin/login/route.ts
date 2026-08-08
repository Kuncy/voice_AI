import { getAdminEnv } from "@heyvera/config";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/admin-password";
import { adminSessionCookie, adminSessionTtlMs, createAdminSessionToken } from "@/lib/admin-session-token";
import { clientAddress, consumeRateLimit } from "@/lib/rate-limit";
import { safeAdminRedirect } from "@/lib/admin-redirect";

export async function POST(request: NextRequest) {
  const address = clientAddress(request);
  if (!consumeRateLimit("admin-login", address, 5, 15 * 60_000)) {
    return new NextResponse("Zu viele Anmeldeversuche.", { status: 429 });
  }

  const form = await request.formData();
  const username = form.get("username");
  const password = form.get("password");
  const next = safeAdminRedirect(form.get("next"));
  const env = getAdminEnv();
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    username !== env.ADMIN_USERNAME ||
    !verifyAdminPassword(password, env.ADMIN_PASSWORD_HASH)
  ) {
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "credentials");
    url.searchParams.set("next", next);
    return NextResponse.redirect(url, 303);
  }

  const response = NextResponse.redirect(new URL(next, request.url), 303);
  response.cookies.set(adminSessionCookie, createAdminSessionToken({
    username: env.ADMIN_USERNAME,
    expiresAt: Date.now() + adminSessionTtlMs,
  }, env.SESSION_SECRET), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: adminSessionTtlMs / 1_000,
    path: "/",
  });
  return response;
}
