import { NextResponse } from "next/server";

export function appRedirect(appUrl: string, location: `/${string}`, status: 303 | 307 = 307): NextResponse {
  return NextResponse.redirect(new URL(location, appUrl), status);
}
