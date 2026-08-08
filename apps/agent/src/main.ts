import { Agent, ServerOptions, beta, cli, dedent, defineAgent, tts, voice, type llm } from "@livekit/agents";
import * as deepgram from "@livekit/agents-plugin-deepgram";
import * as openai from "@livekit/agents-plugin-openai";
import { getAgentEnv } from "@heyvera/config";
import {
  composeAgentInstructions,
  DamageReportService,
  ServiceRequestService,
  fallbackAgentSnapshot,
  itemKey,
  readAgentSnapshot,
  type AgentSnapshotV1,
} from "@heyvera/core";
import {
  createDatabase,
  DrizzleConversationRepository,
  DrizzleDamageReportRepository,
  DrizzleServiceRequestRepository,
} from "@heyvera/db";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { SessionGuardrails, type SessionEndReason } from "./session/guardrails.js";
import { classifyProviderError, providerWarning } from "./session/provider-errors.js";
import { captureGeneratedText } from "./session/capture-generated-text.js";
import { createDamageReportTool } from "./tools/create-damage-report.js";
import { createServiceRequestTool } from "./tools/create-service-request.js";

dotenv.config({ path: [".env.local", "../../.env.local", ".env"] });

const env = getAgentEnv();
const database = createDatabase(env.DATABASE_URL);
const conversations = new DrizzleConversationRepository(database.db);
const damageReportService = new DamageReportService(new DrizzleDamageReportRepository(database.db));
const serviceRequestService = new ServiceRequestService(new DrizzleServiceRequestRepository(database.db));
const sessionNoticeTopic = "heyvera.session";
const toolStatusTopic = "heyvera.tool-status";

const endMessages: Record<SessionEndReason, string> = {
  idle_timeout: "Das Gespräch wurde wegen Inaktivität beendet.",
  max_duration: "Die maximale Gesprächsdauer wurde erreicht.",
  max_turns: "Die maximale Anzahl an Gesprächsrunden wurde erreicht.",
};

function createVeraAgent(snapshot: AgentSnapshotV1, tools: llm.ToolContextLike) {
  const agent = Agent.create({
    instructions: dedent`${composeAgentInstructions(snapshot)}`,
    tools,
  });
  const baseLlmNode = agent.llmNode.bind(agent);
  agent.llmNode = async (...args: Parameters<Agent["llmNode"]>) => {
    const stream = await baseLlmNode(...args);
    if (!stream) return null;
    return captureGeneratedText(stream);
  };
  return agent;
}

export default defineAgent({
  entry: async (context) => {
    const metadata = (() => {
      try {
        return JSON.parse(context.job.metadata) as { conversationId?: unknown };
      } catch {
        return {};
      }
    })();
    const conversationId = typeof metadata.conversationId === "string" ? metadata.conversationId : undefined;
    let agentSnapshot = fallbackAgentSnapshot;
    if (conversationId) {
      try {
        agentSnapshot = readAgentSnapshot(await conversations.getAgentSnapshot(conversationId));
      } catch (error) {
        console.error("agent_snapshot_load_failed", { conversationId, error });
      }
    }
    console.info("agent_job_received", {
      room: context.room.name,
      agent: agentSnapshot.name,
      tone: agentSnapshot.tone,
      phase: 7,
      conversationId,
    });

    let persistenceQueue = Promise.resolve();
    const enqueuePersistence = (label: string, operation: () => Promise<unknown>) => {
      if (!conversationId) return;
      persistenceQueue = persistenceQueue
        .then(operation)
        .then(() => undefined)
        .catch((error: unknown) => {
          console.error("agent_persistence_failed", { room: context.room.name, conversationId, label, error });
        });
    };
    context.addShutdownCallback(async () => {
      await persistenceQueue;
    });

    const session = new voice.AgentSession({
      stt: new deepgram.STTv2({
        apiKey: env.DEEPGRAM_API_KEY,
        model: env.DEEPGRAM_STT_MODEL,
        languageHint: ["de"],
        eotThreshold: env.DEEPGRAM_EOT_THRESHOLD,
        eotTimeoutMs: env.DEEPGRAM_EOT_TIMEOUT_MS,
      }),
      llm: new openai.responses.LLM({
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL,
        reasoning: null,
      }),
      tts: new tts.FallbackAdapter({
        ttsInstances: [
          new deepgram.TTS({
            apiKey: env.DEEPGRAM_API_KEY,
            model: agentSnapshot.ttsModel ?? env.DEEPGRAM_TTS_MODEL,
          }),
          new deepgram.TTS({
            apiKey: env.DEEPGRAM_API_KEY,
            model: env.DEEPGRAM_TTS_FALLBACK_MODEL,
          }),
        ],
        maxRetryPerTTS: 1,
      }),
      turnHandling: {
        turnDetection: "stt",
        interruption: {
          enabled: true,
          mode: "adaptive",
          minDuration: env.INTERRUPTION_MIN_DURATION_MS,
          minWords: env.INTERRUPTION_MIN_WORDS,
        },
      },
      userAwayTimeout: env.IDLE_TIMEOUT_MS / 1_000,
    });

    async function publishNotice(
      notice:
        | { type: "session_ended"; reason: SessionEndReason; message: string }
        | { type: "session_finishing"; message: string }
        | { type: "provider_warning"; message: string },
    ): Promise<void> {
      if (!context.room.isConnected || !context.room.localParticipant) return;
      await context.room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify(notice)),
        { reliable: true, topic: sessionNoticeTopic },
      );
    }

    async function publishToolStatus(event: {
      name: "create_damage_report" | "create_service_request";
      status: "started" | "succeeded" | "failed";
      damageReportId?: string;
      serviceRequestId?: string;
      code?: "VALIDATION_ERROR" | "PERSISTENCE_ERROR";
    }): Promise<void> {
      if (!context.room.isConnected || !context.room.localParticipant) return;
      await context.room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify(event)),
        { reliable: true, topic: toolStatusTopic },
      );
    }

    let lastFinalTranscriptAt: number | undefined;
    let finalUserTurns = 0;
    let assistantTurns = 0;
    let guardrailEndReason: SessionEndReason | undefined;
    const loggedTtsRequests = new Set<string>();
    const metricContext = () => ({
      room: context.room.name,
      conversationId,
      turn: guardrails.turns,
      correlationId: `${conversationId ?? context.room.name}:${guardrails.turns}`,
    });
    const guardrails = new SessionGuardrails({
      maxDurationMs: env.MAX_SESSION_MS,
      maxTurns: env.MAX_TURNS,
      onEnd: (reason) => {
        guardrailEndReason = reason;
        console.info("agent_guardrail_reached", {
          room: context.room.name,
          reason,
          turns: guardrails.turns,
        });
        enqueuePersistence("guardrail_finish", () => conversations.finish(conversationId!, {
          status: "COMPLETED",
          failureCode: "SESSION_LIMIT",
        }));
        void publishNotice({ type: "session_ended", reason, message: endMessages[reason] })
          .catch((error: unknown) => console.warn("agent_notice_publish_failed", { error }))
          .finally(() => void session.close());
      },
    });

    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (event) => {
      if (!event.isFinal) return;
      finalUserTurns += 1;
      lastFinalTranscriptAt = event.createdAt;
      console.info("agent_user_turn_final", {
        room: context.room.name,
        turn: guardrails.onFinalUserTurn(),
        language: event.language,
      });
      enqueuePersistence("user_message", () => conversations.appendFinalMessage(conversationId!, {
        externalItemId: itemKey({
          id: event.itemId,
          role: "USER",
          turnIndex: finalUserTurns,
          content: event.transcript,
        }),
        role: "USER",
        content: event.transcript,
        isFinal: true,
        startedAt: new Date(event.createdAt),
        metadata: event.language ? { language: event.language } : undefined,
      }));
    });
    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (event) => {
      const item = event.item;
      if (item.type !== "message" || item.role !== "assistant") return;
      const content = item.textContent?.trim();
      if (!content) return;
      assistantTurns += 1;
      enqueuePersistence("assistant_message", () => conversations.appendFinalMessage(conversationId!, {
        externalItemId: itemKey({
          id: item.id,
          role: "ASSISTANT",
          turnIndex: assistantTurns,
          content,
        }),
        role: "ASSISTANT",
        content,
        isFinal: true,
        wasInterrupted: item.interrupted,
        startedAt: new Date(item.createdAt),
        metadata: Object.keys(item.extra).length > 0 ? item.extra : undefined,
      }));
    });
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (event) => {
      guardrails.onAgentStateChanged(event.newState);
      if (event.newState === "speaking" && lastFinalTranscriptAt) {
        console.info("agent_voice_latency", {
          ...metricContext(),
          timeToFirstAudioMs: event.createdAt - lastFinalTranscriptAt,
        });
        lastFinalTranscriptAt = undefined;
      }
    });
    session.on(voice.AgentSessionEventTypes.UserStateChanged, (event) => {
      guardrails.onUserStateChanged(event.newState);
    });
    session.on(voice.AgentSessionEventTypes.MetricsCollected, ({ metrics }) => {
      if (metrics.type === "eou_metrics") {
        console.info("agent_eou_metrics", {
          ...metricContext(),
          endOfUtteranceDelayMs: metrics.endOfUtteranceDelayMs,
          transcriptionDelayMs: metrics.transcriptionDelayMs,
        });
      } else if (metrics.type === "llm_metrics") {
        console.info("agent_llm_metrics", {
          ...metricContext(),
          ttftMs: metrics.ttftMs,
          durationMs: metrics.durationMs,
          totalTokens: metrics.totalTokens,
        });
      } else if (metrics.type === "tts_metrics") {
        if (loggedTtsRequests.has(metrics.requestId)) return;
        loggedTtsRequests.add(metrics.requestId);
        console.info("agent_tts_metrics", {
          ...metricContext(),
          requestId: metrics.requestId,
          ttfbMs: metrics.ttfbMs,
          durationMs: metrics.durationMs,
          charactersCount: metrics.charactersCount,
        });
      }
    });
    session.on(voice.AgentSessionEventTypes.OverlappingSpeech, () => {
      console.info("agent_barge_in_detected", metricContext());
    });
    session.on(voice.AgentSessionEventTypes.Error, (event) => {
      const providerError = event.error as { message?: unknown; type?: unknown };
      const classified = classifyProviderError(event.error);
      console.error("agent_provider_error", {
        ...metricContext(),
        kind: classified.kind,
        type: typeof providerError.type === "string" ? providerError.type : "provider_error",
        message:
          typeof providerError.message === "string"
            ? providerError.message
            : "Voice provider request failed",
      });
      void publishNotice({
        type: "provider_warning",
        message: providerWarning(classified.kind),
      }).catch(() => undefined);
    });
    session.on(voice.AgentSessionEventTypes.Close, (event) => {
      guardrails.dispose();
      console.info("agent_session_closed", {
        room: context.room.name,
        reason: event.reason,
        turns: guardrails.turns,
      });
      if (event.error || event.reason === voice.CloseReason.ERROR) {
        enqueuePersistence("failed_finish", () => conversations.finish(conversationId!, {
          status: "FAILED",
          failureCode: "VOICE_PIPELINE_ERROR",
        }));
      } else if (guardrailEndReason) {
        enqueuePersistence("guardrail_close", () => conversations.finish(conversationId!, {
          status: "COMPLETED",
          failureCode: "SESSION_LIMIT",
        }));
      } else if (event.reason === voice.CloseReason.USER_INITIATED) {
        enqueuePersistence("user_finish", () => conversations.finish(conversationId!, { status: "COMPLETED" }));
      } else {
        const reconnectTimer = setTimeout(() => {
          enqueuePersistence("abandoned_finish", () => conversations.finish(conversationId!, {
            status: "ABANDONED",
            failureCode: "RECONNECT_GRACE_EXPIRED",
          }));
        }, env.RECONNECT_GRACE_MS);
        reconnectTimer.unref();
      }
    });

    const tools = conversationId
      ? [
          createDamageReportTool({ conversationId, service: damageReportService, publishStatus: publishToolStatus }),
          createServiceRequestTool({ conversationId, service: serviceRequestService, publishStatus: publishToolStatus }),
          beta.createEndCallTool({
            deleteRoom: true,
            extraDescription:
              "Verwende dieses Tool nach einer gespeicherten Schadensmeldung oder Anfrage erst, wenn der Nutzer auf die Abschlussfrage klar sagt, dass nichts mehr offen ist.",
            endInstructions: "Verabschiede dich kurz und freundlich auf Deutsch.",
            onToolCalled: async () => {
              enqueuePersistence("agent_completed_finish", () => conversations.finish(conversationId, { status: "COMPLETED" }));
              await publishNotice({ type: "session_finishing", message: "Vera beendet das Gespräch nach der Verabschiedung." });
            },
          }),
        ]
      : [];
    await session.start({
      agent: createVeraAgent(agentSnapshot, tools),
      room: context.room,
    });
    await context.connect();
    enqueuePersistence("mark_active", () => conversations.markActive(conversationId!));
    console.info("agent_room_connected", {
      room: context.room.name,
      stt: env.DEEPGRAM_STT_MODEL,
      eotThreshold: env.DEEPGRAM_EOT_THRESHOLD,
      eotTimeoutMs: env.DEEPGRAM_EOT_TIMEOUT_MS,
      llm: env.OPENAI_MODEL,
      tts: agentSnapshot.ttsModel ?? env.DEEPGRAM_TTS_MODEL,
      ttsFallback: env.DEEPGRAM_TTS_FALLBACK_MODEL,
      interruptionMinDurationMs: env.INTERRUPTION_MIN_DURATION_MS,
      interruptionMinWords: env.INTERRUPTION_MIN_WORDS,
    });
    guardrails.start();

    session.generateReply({
      instructions: "Begrüße den Nutzer kurz auf Deutsch und frage, wie du helfen kannst.",
    });
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: env.LIVEKIT_AGENT_NAME,
    host: "0.0.0.0",
    port: 8081,
    drainTimeout: 11 * 60_000,
  }),
);
