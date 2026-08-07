import type { ConversationRepository, ConversationTerminalUpdate, FinalMessage } from "@heyvera/core";
import { and, desc, eq, inArray, max, sql } from "drizzle-orm";
import type { Database } from "./client";
import { agents, conversations, messages } from "./schema";

const nonTerminalStatuses = ["STARTING", "ACTIVE"] as const;

export class DrizzleConversationRepository implements ConversationRepository {
  public constructor(private readonly db: Database) {}

  public async create(input: {
    roomName: string;
    runtimeSnapshot: Record<string, unknown>;
  }): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const [agent] = await tx.select().from(agents).orderBy(agents.createdAt).limit(1);
      if (!agent) throw new Error("Vera agent seed is missing");
      const [conversation] = await tx
        .insert(conversations)
        .values({
          agentId: agent.id,
          livekitRoomName: input.roomName,
          agentSnapshot: {
            id: agent.id,
            name: agent.name,
            language: agent.language,
            tone: agent.tone,
            systemPrompt: agent.systemPrompt,
            ttsModel: agent.ttsModel,
          },
          runtimeSnapshot: input.runtimeSnapshot,
        })
        .returning({ id: conversations.id });
      if (!conversation) throw new Error("Conversation insert returned no row");
      return conversation;
    });
  }

  public async markActive(conversationId: string): Promise<void> {
    await this.db
      .update(conversations)
      .set({ status: "ACTIVE", startedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(conversations.id, conversationId), eq(conversations.status, "STARTING")));
  }

  public async finish(conversationId: string, update: ConversationTerminalUpdate): Promise<void> {
    const now = new Date();
    const writableStatuses = update.status === "COMPLETED" && update.failureCode === "SESSION_LIMIT"
      ? ["STARTING", "ACTIVE", "COMPLETED"] as const
      : nonTerminalStatuses;
    await this.db
      .update(conversations)
      .set({
        status: update.status,
        failureCode: update.failureCode ?? null,
        endedAt: now,
        durationMs: sql<number>`LEAST(2147483647, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE(${conversations.startedAt}, ${conversations.createdAt}))) * 1000)))::integer`,
        updatedAt: now,
      })
      .where(and(eq(conversations.id, conversationId), inArray(conversations.status, [...writableStatuses])));
  }

  public async appendFinalMessage(conversationId: string, message: FinalMessage): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const locked = await tx.execute(sql`SELECT id FROM conversations WHERE id = ${conversationId} FOR UPDATE`);
      if (locked.length === 0) throw new Error(`Conversation ${conversationId} does not exist`);

      const [next] = await tx
        .select({ sequence: max(messages.sequence) })
        .from(messages)
        .where(eq(messages.conversationId, conversationId));
      const inserted = await tx
        .insert(messages)
        .values({
          conversationId,
          externalItemId: message.externalItemId,
          sequence: (next?.sequence ?? 0) + 1,
          role: message.role,
          content: message.content,
          isFinal: true,
          wasInterrupted: message.wasInterrupted ?? false,
          startedAt: message.startedAt,
          metadata: message.metadata,
        })
        .onConflictDoNothing({ target: [messages.conversationId, messages.externalItemId] })
        .returning({ id: messages.id });
      return inserted.length === 1;
    });
  }

  public async list(limit = 50) {
    return this.db
      .select({
        id: conversations.id,
        createdAt: conversations.createdAt,
        startedAt: conversations.startedAt,
        durationMs: conversations.durationMs,
        status: conversations.status,
        failureCode: conversations.failureCode,
        agentName: agents.name,
      })
      .from(conversations)
      .innerJoin(agents, eq(conversations.agentId, agents.id))
      .orderBy(desc(conversations.createdAt))
      .limit(limit);
  }

  public async abandonStale(cutoff: Date): Promise<number> {
    const now = new Date();
    const rows = await this.db
      .update(conversations)
      .set({
        status: "ABANDONED",
        failureCode: "STALE_SESSION",
        endedAt: now,
        durationMs: sql<number>`LEAST(2147483647, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE(${conversations.startedAt}, ${conversations.createdAt}))) * 1000)))::integer`,
        updatedAt: now,
      })
      .where(and(
        inArray(conversations.status, ["STARTING", "ACTIVE"]),
        sql`COALESCE(${conversations.startedAt}, ${conversations.createdAt}) < ${cutoff.toISOString()}::timestamptz`,
      ))
      .returning({ id: conversations.id });
    return rows.length;
  }
}
