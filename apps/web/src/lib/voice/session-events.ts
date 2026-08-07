import type { ToolStatusEvent, VoiceState } from "./transport";

export const sessionNoticeTopic = "heyvera.session";
export const toolStatusTopic = "heyvera.tool-status";

export type SessionNoticePayload =
  | {
      type: "session_ended";
      reason: "idle_timeout" | "max_duration" | "max_turns";
      message: string;
    }
  | { type: "session_finishing"; message: string }
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
    if (
      (value.type === "provider_warning" || value.type === "session_finishing") &&
      typeof value.message === "string"
    ) {
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

export function parseToolStatus(payload: Uint8Array): ToolStatusEvent | undefined {
  try {
    const value = JSON.parse(new TextDecoder().decode(payload)) as Partial<ToolStatusEvent>;
    if (
      value.name === "create_damage_report" &&
      ["started", "succeeded", "failed"].includes(value.status ?? "")
    ) {
      return { name: value.name, status: value.status as ToolStatusEvent["status"] };
    }
  } catch {
    // Ignore malformed or unrelated room data.
  }
  return undefined;
}
