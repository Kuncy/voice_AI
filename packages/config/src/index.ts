import { z } from "zod";

const liveKitEnvSchema = z.object({
  LIVEKIT_URL: z.string().url().refine((value) => value.startsWith("wss://") || value.startsWith("ws://"), {
    message: "LIVEKIT_URL must use ws:// or wss://",
  }),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  LIVEKIT_AGENT_NAME: z.string().min(1).default("heyvera"),
});

const webEnvSchema = liveKitEnvSchema.extend({
  SESSION_SECRET: z.string().min(32),
});

const agentEnvSchema = liveKitEnvSchema.extend({
  DEEPGRAM_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  DEEPGRAM_STT_MODEL: z.string().min(1).default("flux-general-multi"),
  DEEPGRAM_TTS_MODEL: z.string().min(1).default("aura-2-viktoria-de"),
  DEEPGRAM_TTS_FALLBACK_MODEL: z.string().min(1).default("aura-2-elara-de"),
  OPENAI_MODEL: z.string().min(1).default("gpt-4.1"),
  MAX_SESSION_MS: z.coerce.number().int().positive().default(600_000),
  IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  MAX_TURNS: z.coerce.number().int().positive().default(40),
});

export type LiveKitEnv = z.infer<typeof liveKitEnvSchema>;
export type WebEnv = z.infer<typeof webEnvSchema>;
export type AgentEnv = z.infer<typeof agentEnvSchema>;

export function getLiveKitEnv(source: NodeJS.ProcessEnv = process.env): LiveKitEnv {
  return liveKitEnvSchema.parse(source);
}

export function getWebEnv(source: NodeJS.ProcessEnv = process.env): WebEnv {
  return webEnvSchema.parse(source);
}

export function getAgentEnv(source: NodeJS.ProcessEnv = process.env): AgentEnv {
  return agentEnvSchema.parse(source);
}

export const initialVeraConfig = {
  name: "Vera",
  language: "de" as const,
  tone: "Friendly & Professional",
  systemPrompt:
    "Du bist Vera, eine freundliche und professionelle deutschsprachige Sprachassistentin. Antworte kurz, klar und natürlich.",
};
