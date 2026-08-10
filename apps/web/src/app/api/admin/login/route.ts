import { getAdminEnv } from "@heyvera/config";
import { type NextRequest, NextResponse } from "next/server";
import { appRedirect } from "@/lib/app-redirect";
import { verifyAdminPassword } from "@/lib/admin-password";
import { adminSessionCookie, adminSessionTtlMs, createAdminSessionToken } from "@/lib/admin-session-token";
import { clientAddress, consumeRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const address = clientAddress(request);
  if (!consumeRateLimit("admin-login", address, 5, 15 * 60_000)) {
    return new NextResponse("Zu viele Anmeldeversuche.", { status: 429 });
  }

  const form = await request.formData();
  const username = form.get("username");
  const password = form.get("password");
  const env = getAdminEnv();
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    username !== env.ADMIN_USERNAME ||
    !verifyAdminPassword(password, env.ADMIN_PASSWORD_HASH)
  ) {
    return appRedirect(env.APP_URL, "/login?error=credentials", 303);
  }

  const response = appRedirect(env.APP_URL, "/", 303);
  response.cookies.set(
    adminSessionCookie,
    createAdminSessionToken(
      {
        username: env.ADMIN_USERNAME,
        expiresAt: Date.now() + adminSessionTtlMs,
      },
      env.SESSION_SECRET,
    ),
    {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: adminSessionTtlMs / 1_000,
      path: "/",
    },
  );
  return response;
}
