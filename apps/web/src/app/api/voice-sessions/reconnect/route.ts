import { randomUUID } from "node:crypto";
import { TrackSource } from "@livekit/protocol";
import { getWebEnv } from "@heyvera/config";
import { createDatabase, DrizzleConversationRepository } from "@heyvera/db";
import { AccessToken } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import { createSessionHandle, parseSessionHandle } from "@/lib/session-handle";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (request.headers.get("content-length") && request.headers.get("content-length") !== "0") {
    return NextResponse.json({ error: "Der Endpunkt akzeptiert keinen Request-Body." }, { status: 400 });
  }

  const env = getWebEnv();
  const handle = parseSessionHandle(request.cookies.get("heyvera_session")?.value, env.SESSION_SECRET);
  if (!handle) return NextResponse.json({ error: "Die Sitzung ist abgelaufen. Bitte starte ein neues Gespräch." }, { status: 401 });

  const database = createDatabase(env.DATABASE_URL, { max: 1 });
  try {
    const target = await new DrizzleConversationRepository(database.db).getReconnectTarget(handle.conversationId);
    if (!target || target.roomName !== handle.roomName) {
      return NextResponse.json({ error: "Dieses Gespräch kann nicht mehr verbunden werden." }, { status: 409 });
    }

    const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: `web-reconnect-${randomUUID()}`,
      name: "HeyVera Gast",
      ttl: "120s",
    });
    token.addGrant({
      room: target.roomName,
      roomJoin: true,
      canPublish: true,
      canPublishSources: [TrackSource.MICROPHONE],
      canSubscribe: true,
      canPublishData: false,
    });

    const response = NextResponse.json({
      token: await token.toJwt(),
      livekitUrl: env.LIVEKIT_URL,
      roomName: target.roomName,
    });
    response.cookies.set("heyvera_session", createSessionHandle({
      conversationId: handle.conversationId,
      roomName: target.roomName,
      expiresAt: Date.now() + 15 * 60_000,
    }, env.SESSION_SECRET), {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 15 * 60,
      path: "/api/voice-sessions",
    });
    console.info("voice_session_reconnect_token_issued", { conversationId: handle.conversationId });
    return response;
  } catch (error) {
    console.error("voice_session_reconnect_failed", { conversationId: handle.conversationId, error });
    return NextResponse.json({ error: "Die Verbindung konnte nicht wiederhergestellt werden." }, { status: 503 });
  } finally {
    await database.close();
  }
}
