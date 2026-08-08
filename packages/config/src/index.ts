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
  DATABASE_URL: z.string().min(1),
});

const adminEnvSchema = z.object({
  SESSION_SECRET: z.string().min(32),
  ADMIN_USERNAME: z.string().min(1).default("admin"),
  ADMIN_PASSWORD_HASH: z.string().regex(/^scrypt\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/),
});

const maintenanceEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  MAX_SESSION_MS: z.coerce.number().int().positive().default(600_000),
  RECONNECT_GRACE_MS: z.coerce.number().int().nonnegative().default(60_000),
  DATA_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
});

const runtimeConfigSchema = z.object({
  DEEPGRAM_STT_MODEL: z.string().min(1).default("flux-general-multi"),
  DEEPGRAM_EOT_THRESHOLD: z.coerce.number().min(0.5).max(0.95).default(0.75),
  DEEPGRAM_EOT_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(10_000).default(5_000),
  DEEPGRAM_TTS_MODEL: z.string().min(1).default("aura-2-viktoria-de"),
  DEEPGRAM_TTS_FALLBACK_MODEL: z.string().min(1).default("aura-2-elara-de"),
  OPENAI_MODEL: z.string().min(1).default("gpt-4.1"),
  MAX_SESSION_MS: z.coerce.number().int().positive().default(600_000),
  IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  MAX_TURNS: z.coerce.number().int().positive().default(40),
  RECONNECT_GRACE_MS: z.coerce.number().int().nonnegative().default(60_000),
  INTERRUPTION_MIN_DURATION_MS: z.coerce.number().int().min(100).max(2_000).default(400),
  INTERRUPTION_MIN_WORDS: z.coerce.number().int().min(1).max(5).default(1),
});

const agentEnvSchema = liveKitEnvSchema.extend({
  ...runtimeConfigSchema.shape,
  DEEPGRAM_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
});

export type LiveKitEnv = z.infer<typeof liveKitEnvSchema>;
export type WebEnv = z.infer<typeof webEnvSchema>;
export type AgentEnv = z.infer<typeof agentEnvSchema>;
export type AdminEnv = z.infer<typeof adminEnvSchema>;
export type MaintenanceEnv = z.infer<typeof maintenanceEnvSchema>;
export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;

export function getLiveKitEnv(source: NodeJS.ProcessEnv = process.env): LiveKitEnv {
  return liveKitEnvSchema.parse(source);
}

export function getWebEnv(source: NodeJS.ProcessEnv = process.env): WebEnv {
  return webEnvSchema.parse(source);
}

export function getAgentEnv(source: NodeJS.ProcessEnv = process.env): AgentEnv {
  return agentEnvSchema.parse(source);
}

export function getAdminEnv(source: NodeJS.ProcessEnv = process.env): AdminEnv {
  return adminEnvSchema.parse(source);
}

export function getMaintenanceEnv(source: NodeJS.ProcessEnv = process.env): MaintenanceEnv {
  return maintenanceEnvSchema.parse(source);
}

export function getRuntimeConfig(source: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return runtimeConfigSchema.parse(source);
}

export const initialVeraConfig = {
  name: "Vera",
  language: "de" as const,
  tone: "Friendly & Professional",
  systemPrompt:
    "Du bist Vera, eine freundliche und professionelle deutschsprachige Sprachassistentin. Antworte kurz, klar und natürlich.",
};
