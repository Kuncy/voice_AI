import { randomUUID } from "node:crypto";
import { RoomAgentDispatch, RoomConfiguration, TrackSource } from "@livekit/protocol";
import { getWebEnv } from "@heyvera/config";
import { createDatabase, DrizzleConversationRepository } from "@heyvera/db";
import { AccessToken } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import { createSessionHandle } from "@/lib/session-handle";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RateBucket = { count: number; resetsAt: number };
const minuteBuckets = new Map<string, RateBucket>();
const hourBuckets = new Map<string, RateBucket>();

function clientAddress(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function consume(buckets: Map<string, RateBucket>, key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetsAt <= now) {
    buckets.set(key, { count: 1, resetsAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

export async function POST(request: NextRequest) {
  if (request.headers.get("content-length") && request.headers.get("content-length") !== "0") {
    return NextResponse.json({ error: "Der Endpunkt akzeptiert keinen Request-Body." }, { status: 400 });
  }

  const address = clientAddress(request);
  if (
    !consume(minuteBuckets, `minute:${address}`, 5, 60_000) ||
    !consume(hourBuckets, `hour:${address}`, 30, 60 * 60_000)
  ) {
    return NextResponse.json({ error: "Zu viele Sitzungen. Bitte versuche es später erneut." }, { status: 429 });
  }

  let database: ReturnType<typeof createDatabase> | undefined;
  let repository: DrizzleConversationRepository | undefined;
  let conversationId: string | undefined;
  try {
    const env = getWebEnv();
    database = createDatabase(env.DATABASE_URL, { max: 1 });
    repository = new DrizzleConversationRepository(database.db);
    const roomName = `vera-${randomUUID()}`;
    const conversation = await repository.create({
      roomName,
      runtimeSnapshot: {
        stt: "deepgram",
        sttModel: process.env.DEEPGRAM_STT_MODEL ?? "flux-general-multi",
        llm: "openai",
        llmModel: process.env.OPENAI_MODEL ?? "gpt-4.1",
        tts: "deepgram",
        ttsModel: process.env.DEEPGRAM_TTS_MODEL ?? "aura-2-viktoria-de",
        ttsFallbackModel: process.env.DEEPGRAM_TTS_FALLBACK_MODEL ?? "aura-2-elara-de",
        livekitAgentName: env.LIVEKIT_AGENT_NAME,
        maxSessionMs: Number(process.env.MAX_SESSION_MS ?? 600_000),
        idleTimeoutMs: Number(process.env.IDLE_TIMEOUT_MS ?? 60_000),
        maxTurns: Number(process.env.MAX_TURNS ?? 40),
        reconnectGraceMs: Number(process.env.RECONNECT_GRACE_MS ?? 60_000),
        phase: 5,
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
          metadata: JSON.stringify({ phase: 5, conversationId: conversation.id }),
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
  } finally {
    await database?.close();
  }
}
