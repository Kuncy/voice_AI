import { type NextRequest, NextResponse } from "next/server";
import { adminSessionCookie } from "@/lib/admin-session-token";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.delete(adminSessionCookie);
  return response;
}
