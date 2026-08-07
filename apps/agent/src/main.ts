import { Agent, ServerOptions, cli, dedent, defineAgent, voice } from "@livekit/agents";
import * as deepgram from "@livekit/agents-plugin-deepgram";
import * as openai from "@livekit/agents-plugin-openai";
import { getAgentEnv, initialVeraConfig } from "@heyvera/config";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: [".env.local", "../../.env.local", ".env"] });

const env = getAgentEnv();

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
      phase: 1,
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
      tts: new deepgram.TTS({
        apiKey: env.DEEPGRAM_API_KEY,
        model: env.DEEPGRAM_TTS_MODEL,
      }),
      turnHandling: {
        turnDetection: "stt",
      },
      userAwayTimeout: env.IDLE_TIMEOUT_MS / 1_000,
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
    });

    const sessionLimit = setTimeout(() => {
      console.info("agent_session_limit_reached", { room: context.room.name });
      void session.close();
    }, env.MAX_SESSION_MS);
    sessionLimit.unref();

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
