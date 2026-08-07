import type { VoiceState } from "./transport";

export const sessionNoticeTopic = "heyvera.session";

export type SessionNoticePayload =
  | {
      type: "session_ended";
      reason: "idle_timeout" | "max_duration" | "max_turns";
      message: string;
    }
  | { type: "provider_warning"; message: string };

export function mapAgentState(state: string | undefined): VoiceState | undefined {
  switch (state) {
    case "initializing":
      return "connecting";
    case "idle":
    case "listening":
      return "listening";
    case "thinking":
      return "thinking";
    case "speaking":
      return "speaking";
    default:
      return undefined;
  }
}

export function parseSessionNotice(payload: Uint8Array): SessionNoticePayload | undefined {
  try {
    const value = JSON.parse(new TextDecoder().decode(payload)) as Partial<SessionNoticePayload>;
    if (value.type === "provider_warning" && typeof value.message === "string") {
      return { type: value.type, message: value.message };
    }
    if (
      value.type === "session_ended" &&
      typeof value.message === "string" &&
      ["idle_timeout", "max_duration", "max_turns"].includes(value.reason ?? "")
    ) {
      return value as Extract<SessionNoticePayload, { type: "session_ended" }>;
    }
  } catch {
    // Ignore malformed or unrelated room data.
  }
  return undefined;
}
