import { randomUUID } from "node:crypto";
import { RoomAgentDispatch, RoomConfiguration, TrackSource } from "@livekit/protocol";
import { getRuntimeConfig, getWebEnv } from "@heyvera/config";
import { DrizzleConversationRepository } from "@heyvera/db";
import { AccessToken } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import { createSessionHandle } from "@/lib/session-handle";
import { clientAddress, consumeRateLimit } from "@/lib/rate-limit";
import { getWebDatabase } from "@/lib/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (request.headers.get("content-length") && request.headers.get("content-length") !== "0") {
    return NextResponse.json({ error: "Der Endpunkt akzeptiert keinen Request-Body." }, { status: 400 });
  }

  const address = clientAddress(request);
  if (
    !consumeRateLimit("voice-session-minute", address, 5, 60_000) ||
    !consumeRateLimit("voice-session-hour", address, 30, 60 * 60_000)
  ) {
    return NextResponse.json({ error: "Zu viele Sitzungen. Bitte versuche es später erneut." }, { status: 429 });
  }

  let repository: DrizzleConversationRepository | undefined;
  let conversationId: string | undefined;
  try {
    const env = getWebEnv();
    const runtime = getRuntimeConfig();
    repository = new DrizzleConversationRepository(getWebDatabase().db);
    const roomName = `vera-${randomUUID()}`;
    const conversation = await repository.create({
      roomName,
      runtimeSnapshot: {
        stt: "deepgram",
        sttModel: runtime.DEEPGRAM_STT_MODEL,
        eotThreshold: runtime.DEEPGRAM_EOT_THRESHOLD,
        eotTimeoutMs: runtime.DEEPGRAM_EOT_TIMEOUT_MS,
        llm: "openai",
        llmModel: runtime.OPENAI_MODEL,
        tts: "deepgram",
        ttsModel: runtime.DEEPGRAM_TTS_MODEL,
        ttsFallbackModel: runtime.DEEPGRAM_TTS_FALLBACK_MODEL,
        livekitAgentName: env.LIVEKIT_AGENT_NAME,
        maxSessionMs: runtime.MAX_SESSION_MS,
        idleTimeoutMs: runtime.IDLE_TIMEOUT_MS,
        maxTurns: runtime.MAX_TURNS,
        reconnectGraceMs: runtime.RECONNECT_GRACE_MS,
        interruptionMinDurationMs: runtime.INTERRUPTION_MIN_DURATION_MS,
        interruptionMinWords: runtime.INTERRUPTION_MIN_WORDS,
        phase: 7,
      },
    });
    conversationId = conversation.id;
    const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: `web-${randomUUID()}`,
      name: "HeyVera Gast",
      ttl: "120s",
    });

    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canPublishSources: [TrackSource.MICROPHONE],
      canSubscribe: true,
      canPublishData: false,
    });
    token.roomConfig = new RoomConfiguration({
      agents: [
        new RoomAgentDispatch({
          agentName: env.LIVEKIT_AGENT_NAME,
          metadata: JSON.stringify({ phase: 7, conversationId: conversation.id }),
        }),
      ],
    });

    const response = NextResponse.json({
      token: await token.toJwt(),
      livekitUrl: env.LIVEKIT_URL,
      roomName,
    });
    response.cookies.set("heyvera_session", createSessionHandle({
      conversationId: conversation.id,
      roomName,
      expiresAt: Date.now() + 15 * 60_000,
    }, env.SESSION_SECRET), {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 15 * 60,
      path: "/api/voice-sessions",
    });
    return response;
  } catch (error) {
    if (conversationId && repository) {
      await repository
        .finish(conversationId, { status: "FAILED", failureCode: "SESSION_CREATE_FAILED" })
        .catch(() => undefined);
    }
    console.error("voice_session_create_failed", { error });
    return NextResponse.json({ error: "Die Voice-Session konnte nicht gestartet werden." }, { status: 503 });
  }
}
