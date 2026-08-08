import { getWebEnv } from "@heyvera/config";
import { DrizzleConversationRepository } from "@heyvera/db";
import { NextRequest, NextResponse } from "next/server";
import { parseSessionHandle } from "@/lib/session-handle";
import { getWebDatabase } from "@/lib/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const env = getWebEnv();
  const handle = parseSessionHandle(request.cookies.get("heyvera_session")?.value, env.SESSION_SECRET);
  if (!handle) return NextResponse.json({ error: "Ungültige oder abgelaufene Sitzung." }, { status: 401 });

  try {
    await new DrizzleConversationRepository(getWebDatabase().db).finish(handle.conversationId, { status: "COMPLETED" });
    const response = new NextResponse(null, { status: 204 });
    response.cookies.set("heyvera_session", "", {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 0,
      path: "/api/voice-sessions",
    });
    return response;
  } catch (error) {
    console.error("voice_session_end_failed", { conversationId: handle.conversationId, error });
    return NextResponse.json({ error: "Die Sitzung konnte nicht abgeschlossen werden." }, { status: 503 });
  }
}
