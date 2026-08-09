import { randomUUID } from "node:crypto";
import { getWebEnv } from "@heyvera/config";
import { DrizzleConversationRepository } from "@heyvera/db";
import { ParticipantInfo_Kind, TrackSource } from "@livekit/protocol";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { type NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-request";
import { getWebDatabase } from "@/lib/database";
import { clientAddress, consumeRateLimit } from "@/lib/rate-limit";
import { createSessionHandle, parseSessionHandle } from "@/lib/session-handle";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminApi(request);
  if (unauthorized) return unauthorized;

  if (request.headers.get("content-length") && request.headers.get("content-length") !== "0") {
    return NextResponse.json({ error: "Der Endpunkt akzeptiert keinen Request-Body." }, { status: 400 });
  }

  const env = getWebEnv();
  const handle = parseSessionHandle(request.cookies.get("heyvera_session")?.value, env.SESSION_SECRET);
  if (!handle)
    return NextResponse.json(
      { error: "Die Sitzung ist abgelaufen. Bitte starte ein neues Gespräch." },
      { status: 401 },
    );
  if (!consumeRateLimit("voice-reconnect", clientAddress(request), 10, 60_000)) {
    return NextResponse.json(
      { error: "Zu viele Verbindungsversuche. Bitte versuche es später erneut." },
      { status: 429 },
    );
  }

  try {
    const target = await new DrizzleConversationRepository(getWebDatabase().db).getReconnectTarget(
      handle.conversationId,
    );
    if (!target || target.roomName !== handle.roomName) {
      return NextResponse.json({ error: "Dieses Gespräch kann nicht mehr verbunden werden." }, { status: 409 });
    }

    const roomService = new RoomServiceClient(env.LIVEKIT_URL, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
    const rooms = await roomService.listRooms([target.roomName]);
    if (rooms.length === 0) {
      return NextResponse.json({ error: "Dieses Gespräch ist nicht mehr aktiv." }, { status: 409 });
    }
    const participants = await roomService.listParticipants(target.roomName);
    if (!participants.some((participant) => participant.kind === ParticipantInfo_Kind.AGENT)) {
      return NextResponse.json({ error: "Vera ist für dieses Gespräch nicht mehr verfügbar." }, { status: 409 });
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
    response.cookies.set(
      "heyvera_session",
      createSessionHandle(
        {
          conversationId: handle.conversationId,
          roomName: target.roomName,
          expiresAt: handle.expiresAt,
        },
        env.SESSION_SECRET,
      ),
      {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        maxAge: Math.max(1, Math.ceil((handle.expiresAt - Date.now()) / 1_000)),
        path: "/api/voice-sessions",
      },
    );
    console.info("voice_session_reconnect_token_issued", { conversationId: handle.conversationId });
    return response;
  } catch (error) {
    console.error("voice_session_reconnect_failed", { conversationId: handle.conversationId, error });
    return NextResponse.json({ error: "Die Verbindung konnte nicht wiederhergestellt werden." }, { status: 503 });
  }
}
