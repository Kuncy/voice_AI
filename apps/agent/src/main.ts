import { Agent, ServerOptions, cli, dedent, defineAgent, tts, voice } from "@livekit/agents";
import * as deepgram from "@livekit/agents-plugin-deepgram";
import * as openai from "@livekit/agents-plugin-openai";
import { getAgentEnv, initialVeraConfig } from "@heyvera/config";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { SessionGuardrails, type SessionEndReason } from "./session/guardrails.js";

dotenv.config({ path: [".env.local", "../../.env.local", ".env"] });

const env = getAgentEnv();
const sessionNoticeTopic = "heyvera.session";

const endMessages: Record<SessionEndReason, string> = {
  idle_timeout: "Das Gespräch wurde wegen Inaktivität beendet.",
  max_duration: "Die maximale Gesprächsdauer wurde erreicht.",
  max_turns: "Die maximale Anzahl an Gesprächsrunden wurde erreicht.",
};

function createVeraAgent() {
  return Agent.create({
    instructions: dedent`
      Du bist ${initialVeraConfig.name}, eine freundliche und professionelle deutschsprachige Sprachassistentin.

      Antworte ausschließlich auf Deutsch, kurz und natürlich. Verwende ein bis drei Sätze und stelle immer nur eine Frage gleichzeitig.
      Deine Antworten werden vorgelesen: Nutze nur Klartext, kein Markdown, keine Aufzählungszeichen, keine Emojis und keine technischen Interna.
      Wenn du etwas nicht sicher weißt, sage das offen. In dieser ersten Voice-Phase führst du noch keine externen Aktionen aus.
    `,
  });
}

export default defineAgent({
  entry: async (context) => {
    console.info("agent_job_received", {
      room: context.room.name,
      agent: initialVeraConfig.name,
      phase: 2,
    });

    const session = new voice.AgentSession({
      stt: new deepgram.STTv2({
        apiKey: env.DEEPGRAM_API_KEY,
        model: env.DEEPGRAM_STT_MODEL,
        languageHint: ["de"],
        eotThreshold: 0.75,
        eotTimeoutMs: 5_000,
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
            model: env.DEEPGRAM_TTS_MODEL,
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
          minDuration: 400,
          minWords: 1,
        },
      },
      userAwayTimeout: env.IDLE_TIMEOUT_MS / 1_000,
    });

    async function publishNotice(
      notice:
        | { type: "session_ended"; reason: SessionEndReason; message: string }
        | { type: "provider_warning"; message: string },
    ): Promise<void> {
      if (!context.room.isConnected || !context.room.localParticipant) return;
      await context.room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify(notice)),
        { reliable: true, topic: sessionNoticeTopic },
      );
    }

    let lastFinalTranscriptAt: number | undefined;
    const loggedTtsRequests = new Set<string>();
    const guardrails = new SessionGuardrails({
      maxDurationMs: env.MAX_SESSION_MS,
      maxTurns: env.MAX_TURNS,
      onEnd: (reason) => {
        console.info("agent_guardrail_reached", {
          room: context.room.name,
          reason,
          turns: guardrails.turns,
        });
        void publishNotice({ type: "session_ended", reason, message: endMessages[reason] })
          .catch((error: unknown) => console.warn("agent_notice_publish_failed", { error }))
          .finally(() => void session.close());
      },
    });

    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (event) => {
      if (!event.isFinal) return;
      lastFinalTranscriptAt = event.createdAt;
      console.info("agent_user_turn_final", {
        room: context.room.name,
        turn: guardrails.onFinalUserTurn(),
        language: event.language,
      });
    });
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (event) => {
      guardrails.onAgentStateChanged(event.newState);
      if (event.newState === "speaking" && lastFinalTranscriptAt) {
        console.info("agent_voice_latency", {
          room: context.room.name,
          timeToFirstAudioMs: event.createdAt - lastFinalTranscriptAt,
          turn: guardrails.turns,
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
          endOfUtteranceDelayMs: metrics.endOfUtteranceDelayMs,
          transcriptionDelayMs: metrics.transcriptionDelayMs,
        });
      } else if (metrics.type === "llm_metrics") {
        console.info("agent_llm_metrics", {
          ttftMs: metrics.ttftMs,
          durationMs: metrics.durationMs,
          totalTokens: metrics.totalTokens,
        });
      } else if (metrics.type === "tts_metrics") {
        if (loggedTtsRequests.has(metrics.requestId)) return;
        loggedTtsRequests.add(metrics.requestId);
        console.info("agent_tts_metrics", {
          ttfbMs: metrics.ttfbMs,
          durationMs: metrics.durationMs,
          charactersCount: metrics.charactersCount,
        });
      }
    });
    session.on(voice.AgentSessionEventTypes.OverlappingSpeech, () => {
      console.info("agent_barge_in_detected", { room: context.room.name });
    });
    session.on(voice.AgentSessionEventTypes.Error, (event) => {
      const providerError = event.error as { message?: unknown; type?: unknown };
      console.error("agent_provider_error", {
        room: context.room.name,
        type: typeof providerError.type === "string" ? providerError.type : "provider_error",
        message:
          typeof providerError.message === "string"
            ? providerError.message
            : "Voice provider request failed",
      });
      void publishNotice({
        type: "provider_warning",
        message: "Ein Sprachanbieter hatte kurzzeitig ein Problem. Vera versucht es erneut.",
      }).catch(() => undefined);
    });
    session.on(voice.AgentSessionEventTypes.Close, (event) => {
      guardrails.dispose();
      console.info("agent_session_closed", {
        room: context.room.name,
        reason: event.reason,
        turns: guardrails.turns,
      });
    });

    await session.start({
      agent: createVeraAgent(),
      room: context.room,
    });
    await context.connect();
    console.info("agent_room_connected", {
      room: context.room.name,
      stt: env.DEEPGRAM_STT_MODEL,
      llm: env.OPENAI_MODEL,
      tts: env.DEEPGRAM_TTS_MODEL,
      ttsFallback: env.DEEPGRAM_TTS_FALLBACK_MODEL,
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
