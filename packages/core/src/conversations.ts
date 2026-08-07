import { createHash } from "node:crypto";

export const conversationStatuses = ["STARTING", "ACTIVE", "COMPLETED", "FAILED", "ABANDONED"] as const;
export type ConversationStatus = (typeof conversationStatuses)[number];

export const messageRoles = ["USER", "ASSISTANT", "SYSTEM", "TOOL"] as const;
export type MessageRole = (typeof messageRoles)[number];

export type FinalMessage = {
  externalItemId: string;
  role: MessageRole;
  content: string;
  isFinal: true;
  wasInterrupted?: boolean;
  startedAt?: Date;
  metadata?: Record<string, unknown>;
};

export type ConversationTerminalUpdate = {
  status: Extract<ConversationStatus, "COMPLETED" | "FAILED" | "ABANDONED">;
  failureCode?: string;
};

export interface ConversationRepository {
  markActive(conversationId: string): Promise<void>;
  finish(conversationId: string, update: ConversationTerminalUpdate): Promise<void>;
  appendFinalMessage(conversationId: string, message: FinalMessage): Promise<boolean>;
}

export function itemKey(input: {
  id?: string | null;
  role: MessageRole;
  turnIndex: number;
  content: string;
}): string {
  if (input.id) return `lk:${input.id}`;
  const digest = createHash("sha256")
    .update(`${input.role}\u0000${input.turnIndex}\u0000${input.content}`)
    .digest("hex")
    .slice(0, 32);
  return `synth:${digest}`;
}
