import {
  type AgentSettings,
  agentSettingsSchema,
  type ConversationRepository,
  type ConversationTerminalUpdate,
  type CreateDamageReportInput,
  type CreateServiceRequestInput,
  createAgentSnapshot,
  type DamageReportRepository,
  type FinalMessage,
  type ServiceRequestRepository,
} from "@heyvera/core";
import { and, asc, desc, eq, inArray, max, sql } from "drizzle-orm";
import type { Database } from "./client";
import { agents, conversations, damageReports, messages, serviceRequests, toolCalls } from "./schema";

const nonTerminalStatuses = ["STARTING", "ACTIVE"] as const;

async function recordFailedToolCall(
  db: Database,
  input: {
    conversationId: string;
    providerCallId: string;
    toolName: "create_damage_report" | "create_service_request";
    arguments: Record<string, unknown>;
    startedAt: Date;
  },
): Promise<void> {
  const completedAt = new Date();
  await db
    .insert(toolCalls)
    .values({
      conversationId: input.conversationId,
      providerCallId: input.providerCallId,
      toolName: input.toolName,
      arguments: input.arguments,
      status: "FAILED",
      errorCode: "PERSISTENCE_ERROR",
      durationMs: completedAt.getTime() - input.startedAt.getTime(),
      completedAt,
    })
    .onConflictDoUpdate({
      target: [toolCalls.conversationId, toolCalls.providerCallId],
      set: {
        status: "FAILED",
        errorCode: "PERSISTENCE_ERROR",
        durationMs: completedAt.getTime() - input.startedAt.getTime(),
        completedAt,
      },
      setWhere: eq(toolCalls.status, "STARTED"),
    });
}

export class DrizzleAgentRepository {
  public constructor(private readonly db: Database) {}

  public async get() {
    const [agent] = await this.db.select().from(agents).orderBy(agents.createdAt).limit(1);
    if (!agent) throw new Error("Vera agent seed is missing");
    return agent;
  }

  public async update(settings: AgentSettings) {
    const current = await this.get();
    const [updated] = await this.db
      .update(agents)
      .set({ ...settings, updatedAt: new Date() })
      .where(eq(agents.id, current.id))
      .returning();
    if (!updated) throw new Error("Vera agent update returned no row");
    return updated;
  }
}

export class DrizzleDamageReportRepository implements DamageReportRepository {
  public constructor(private readonly db: Database) {}

  public async create(input: {
    conversationId: string;
    providerCallId: string;
    report: CreateDamageReportInput;
  }): Promise<{ damageReportId: string; status: "open" }> {
    const startedAt = new Date();
    try {
      return await this.db.transaction(async (tx) => {
        const [insertedCall] = await tx
          .insert(toolCalls)
          .values({
            conversationId: input.conversationId,
            providerCallId: input.providerCallId,
            toolName: "create_damage_report",
            arguments: input.report,
          })
          .onConflictDoNothing({ target: [toolCalls.conversationId, toolCalls.providerCallId] })
          .returning({ id: toolCalls.id });

        if (!insertedCall) {
          const [existing] = await tx
            .select({ damageReportId: damageReports.id, status: damageReports.status })
            .from(toolCalls)
            .innerJoin(damageReports, eq(damageReports.toolCallId, toolCalls.id))
            .where(
              and(
                eq(toolCalls.conversationId, input.conversationId),
                eq(toolCalls.providerCallId, input.providerCallId),
              ),
            )
            .limit(1);
          if (existing?.status !== "OPEN") {
            throw new Error("Existing damage report tool call has no open report");
          }
          return { damageReportId: existing.damageReportId, status: "open" };
        }

        const [report] = await tx
          .insert(damageReports)
          .values({
            conversationId: input.conversationId,
            toolCallId: insertedCall.id,
            reporterName: input.report.reporterName,
            category: input.report.category.toUpperCase() as Uppercase<CreateDamageReportInput["category"]>,
            description: input.report.description,
            urgency: input.report.urgency.toUpperCase() as Uppercase<CreateDamageReportInput["urgency"]>,
            streetAndHouseNumber: input.report.streetAndHouseNumber,
            postalCode: input.report.postalCode,
            city: input.report.city,
          })
          .returning({ id: damageReports.id });
        if (!report) throw new Error("Damage report insert returned no row");

        const result = { ok: true, damageReportId: report.id, status: "open" as const };
        const completedAt = new Date();
        await tx
          .update(toolCalls)
          .set({
            result,
            status: "SUCCEEDED",
            durationMs: completedAt.getTime() - startedAt.getTime(),
            completedAt,
          })
          .where(eq(toolCalls.id, insertedCall.id));
        return { damageReportId: report.id, status: "open" };
      });
    } catch (error) {
      await recordFailedToolCall(this.db, {
        conversationId: input.conversationId,
        providerCallId: input.providerCallId,
        toolName: "create_damage_report",
        arguments: input.report,
        startedAt,
      }).catch((auditError: unknown) => {
        console.error("failed_tool_call_audit_write_failed", { auditError });
      });
      throw error;
    }
  }
}

export class DrizzleServiceRequestRepository implements ServiceRequestRepository {
  public constructor(private readonly db: Database) {}

  public async create(input: {
    conversationId: string;
    providerCallId: string;
    request: CreateServiceRequestInput;
  }): Promise<{ serviceRequestId: string; status: "open" }> {
    const startedAt = new Date();
    try {
      return await this.db.transaction(async (tx) => {
        const [insertedCall] = await tx
          .insert(toolCalls)
          .values({
            conversationId: input.conversationId,
            providerCallId: input.providerCallId,
            toolName: "create_service_request",
            arguments: input.request,
          })
          .onConflictDoNothing({ target: [toolCalls.conversationId, toolCalls.providerCallId] })
          .returning({ id: toolCalls.id });

        if (!insertedCall) {
          const [existing] = await tx
            .select({ serviceRequestId: serviceRequests.id, status: serviceRequests.status })
            .from(toolCalls)
            .innerJoin(serviceRequests, eq(serviceRequests.toolCallId, toolCalls.id))
            .where(
              and(
                eq(toolCalls.conversationId, input.conversationId),
                eq(toolCalls.providerCallId, input.providerCallId),
              ),
            )
            .limit(1);
          if (existing?.status !== "OPEN") {
            throw new Error("Existing service request tool call has no open request");
          }
          return { serviceRequestId: existing.serviceRequestId, status: "open" };
        }

        const [request] = await tx
          .insert(serviceRequests)
          .values({
            conversationId: input.conversationId,
            toolCallId: insertedCall.id,
            requestType: input.request.requestType.toUpperCase() as Uppercase<CreateServiceRequestInput["requestType"]>,
            reporterName: input.request.reporterName,
            description: input.request.description,
            streetAndHouseNumber: input.request.streetAndHouseNumber,
            postalCode: input.request.postalCode,
            city: input.request.city,
            preferredTimeframe: input.request.preferredTimeframe,
          })
          .returning({ id: serviceRequests.id });
        if (!request) throw new Error("Service request insert returned no row");

        const result = { ok: true, serviceRequestId: request.id, status: "open" as const };
        const completedAt = new Date();
        await tx
          .update(toolCalls)
          .set({
            result,
            status: "SUCCEEDED",
            durationMs: completedAt.getTime() - startedAt.getTime(),
            completedAt,
          })
          .where(eq(toolCalls.id, insertedCall.id));
        return { serviceRequestId: request.id, status: "open" };
      });
    } catch (error) {
      await recordFailedToolCall(this.db, {
        conversationId: input.conversationId,
        providerCallId: input.providerCallId,
        toolName: "create_service_request",
        arguments: input.request,
        startedAt,
      }).catch((auditError: unknown) => {
        console.error("failed_tool_call_audit_write_failed", { auditError });
      });
      throw error;
    }
  }
}

export class DrizzleIntakeRepository {
  public constructor(private readonly db: Database) {}

  public async list(limit = 100) {
    const [damageRows, serviceRows] = await Promise.all([
      this.db
        .select({
          id: damageReports.id,
          conversationId: damageReports.conversationId,
          reporterName: damageReports.reporterName,
          description: damageReports.description,
          streetAndHouseNumber: damageReports.streetAndHouseNumber,
          postalCode: damageReports.postalCode,
          city: damageReports.city,
          status: damageReports.status,
          urgency: damageReports.urgency,
          createdAt: damageReports.createdAt,
        })
        .from(damageReports)
        .orderBy(desc(damageReports.createdAt))
        .limit(limit),
      this.db
        .select({
          id: serviceRequests.id,
          conversationId: serviceRequests.conversationId,
          requestType: serviceRequests.requestType,
          reporterName: serviceRequests.reporterName,
          description: serviceRequests.description,
          streetAndHouseNumber: serviceRequests.streetAndHouseNumber,
          postalCode: serviceRequests.postalCode,
          city: serviceRequests.city,
          preferredTimeframe: serviceRequests.preferredTimeframe,
          status: serviceRequests.status,
          createdAt: serviceRequests.createdAt,
        })
        .from(serviceRequests)
        .orderBy(desc(serviceRequests.createdAt))
        .limit(limit),
    ]);

    return [
      ...damageRows.map((row) => ({ ...row, kind: "DAMAGE" as const, preferredTimeframe: null })),
      ...serviceRows.map((row) => ({ ...row, kind: row.requestType, urgency: null })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
}

export class DrizzleConversationRepository implements ConversationRepository {
  public constructor(private readonly db: Database) {}

  public async create(input: { roomName: string; runtimeSnapshot: Record<string, unknown> }): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const [agent] = await tx.select().from(agents).orderBy(agents.createdAt).limit(1);
      if (!agent) throw new Error("Vera agent seed is missing");
      const settings = agentSettingsSchema.parse({
        name: agent.name,
        tone: agent.tone,
        systemPrompt: agent.systemPrompt,
      });
      const [conversation] = await tx
        .insert(conversations)
        .values({
          agentId: agent.id,
          livekitRoomName: input.roomName,
          agentSnapshot: createAgentSnapshot({
            schemaVersion: 1,
            id: agent.id,
            name: settings.name,
            language: "de",
            tone: settings.tone,
            systemPrompt: settings.systemPrompt,
            ttsModel: agent.ttsModel,
          }),
          runtimeSnapshot: input.runtimeSnapshot,
        })
        .returning({ id: conversations.id });
      if (!conversation) throw new Error("Conversation insert returned no row");
      return conversation;
    });
  }

  public async getAgentSnapshot(conversationId: string): Promise<unknown | undefined> {
    const [row] = await this.db
      .select({ agentSnapshot: conversations.agentSnapshot })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    return row?.agentSnapshot;
  }

  public async delete(conversationId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(conversations)
      .where(
        and(eq(conversations.id, conversationId), inArray(conversations.status, ["COMPLETED", "FAILED", "ABANDONED"])),
      )
      .returning({ id: conversations.id });
    return deleted.length > 0;
  }

  public async deleteByRoomNames(roomNames: string[]): Promise<number> {
    if (roomNames.length === 0) return 0;
    const deleted = await this.db
      .delete(conversations)
      .where(inArray(conversations.livekitRoomName, roomNames))
      .returning({ id: conversations.id });
    return deleted.length;
  }

  public async deleteTerminalBefore(cutoff: Date): Promise<number> {
    const deleted = await this.db
      .delete(conversations)
      .where(
        and(
          inArray(conversations.status, ["COMPLETED", "FAILED", "ABANDONED"]),
          sql`${conversations.updatedAt} < ${cutoff.toISOString()}::timestamptz`,
        ),
      )
      .returning({ id: conversations.id });
    return deleted.length;
  }

  public async getReconnectTarget(conversationId: string): Promise<{ roomName: string } | undefined> {
    const [row] = await this.db
      .select({ roomName: conversations.livekitRoomName, status: conversations.status })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (!row || !nonTerminalStatuses.includes(row.status as (typeof nonTerminalStatuses)[number])) return undefined;
    return { roomName: row.roomName };
  }

  public async markActive(conversationId: string): Promise<void> {
    await this.db
      .update(conversations)
      .set({ status: "ACTIVE", startedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(conversations.id, conversationId), eq(conversations.status, "STARTING")));
  }

  public async finish(conversationId: string, update: ConversationTerminalUpdate): Promise<void> {
    const now = new Date();
    const writableStatuses =
      update.status === "COMPLETED" && update.failureCode === "SESSION_LIMIT"
        ? (["STARTING", "ACTIVE", "COMPLETED"] as const)
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
        agentSnapshot: conversations.agentSnapshot,
      })
      .from(conversations)
      .orderBy(desc(conversations.createdAt))
      .limit(limit);
  }

  public async getDetail(conversationId: string) {
    const [conversation] = await this.db
      .select({
        id: conversations.id,
        livekitRoomName: conversations.livekitRoomName,
        status: conversations.status,
        startedAt: conversations.startedAt,
        endedAt: conversations.endedAt,
        durationMs: conversations.durationMs,
        failureCode: conversations.failureCode,
        agentSnapshot: conversations.agentSnapshot,
        runtimeSnapshot: conversations.runtimeSnapshot,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (!conversation) return undefined;

    const [savedMessages, savedToolCalls] = await Promise.all([
      this.db
        .select({
          id: messages.id,
          sequence: messages.sequence,
          role: messages.role,
          content: messages.content,
          wasInterrupted: messages.wasInterrupted,
          startedAt: messages.startedAt,
          createdAt: messages.createdAt,
          metadata: messages.metadata,
        })
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(asc(messages.sequence)),
      this.db
        .select({
          id: toolCalls.id,
          providerCallId: toolCalls.providerCallId,
          toolName: toolCalls.toolName,
          arguments: toolCalls.arguments,
          result: toolCalls.result,
          status: toolCalls.status,
          errorCode: toolCalls.errorCode,
          durationMs: toolCalls.durationMs,
          createdAt: toolCalls.createdAt,
          completedAt: toolCalls.completedAt,
          damageReportId: damageReports.id,
          damageReporterName: damageReports.reporterName,
          damageCategory: damageReports.category,
          damageDescription: damageReports.description,
          damageUrgency: damageReports.urgency,
          damageStreetAndHouseNumber: damageReports.streetAndHouseNumber,
          damagePostalCode: damageReports.postalCode,
          damageCity: damageReports.city,
          damageStatus: damageReports.status,
          damageCreatedAt: damageReports.createdAt,
          serviceRequestId: serviceRequests.id,
          serviceRequestType: serviceRequests.requestType,
          serviceReporterName: serviceRequests.reporterName,
          serviceDescription: serviceRequests.description,
          serviceStreetAndHouseNumber: serviceRequests.streetAndHouseNumber,
          servicePostalCode: serviceRequests.postalCode,
          serviceCity: serviceRequests.city,
          servicePreferredTimeframe: serviceRequests.preferredTimeframe,
          serviceStatus: serviceRequests.status,
          serviceCreatedAt: serviceRequests.createdAt,
        })
        .from(toolCalls)
        .leftJoin(damageReports, eq(damageReports.toolCallId, toolCalls.id))
        .leftJoin(serviceRequests, eq(serviceRequests.toolCallId, toolCalls.id))
        .where(eq(toolCalls.conversationId, conversationId))
        .orderBy(asc(toolCalls.createdAt)),
    ]);

    return { conversation, messages: savedMessages, toolCalls: savedToolCalls };
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
      .where(
        and(
          inArray(conversations.status, ["STARTING", "ACTIVE"]),
          sql`COALESCE(${conversations.startedAt}, ${conversations.createdAt}) < ${cutoff.toISOString()}::timestamptz`,
        ),
      )
      .returning({ id: conversations.id });
    return rows.length;
  }
}
