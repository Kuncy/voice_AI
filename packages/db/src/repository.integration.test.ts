import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { createDatabase } from "./client";
import { DrizzleAgentRepository, DrizzleConversationRepository, DrizzleDamageReportRepository } from "./repository";
import { conversations, damageReports, messages, toolCalls } from "./schema";

const databaseUrl = process.env.DATABASE_URL;

test("conversation lifecycle persists final messages idempotently and in order", { skip: !databaseUrl }, async () => {
  const database = createDatabase(databaseUrl!, { max: 2 });
  const repository = new DrizzleConversationRepository(database.db);
  let conversationId: string | undefined;
  try {
    const created = await repository.create({
      roomName: `integration-${crypto.randomUUID()}`,
      runtimeSnapshot: { phase: 3, test: true },
    });
    conversationId = created.id;
    await repository.markActive(created.id);

    const first = await repository.appendFinalMessage(created.id, {
      externalItemId: "lk:user-1",
      role: "USER",
      content: "Hallo Vera",
      isFinal: true,
    });
    const duplicate = await repository.appendFinalMessage(created.id, {
      externalItemId: "lk:user-1",
      role: "USER",
      content: "Hallo Vera",
      isFinal: true,
    });
    await repository.appendFinalMessage(created.id, {
      externalItemId: "lk:assistant-1",
      role: "ASSISTANT",
      content: "Hallo! Wie kann ich helfen?",
      isFinal: true,
    });
    await repository.finish(created.id, { status: "COMPLETED" });
    await repository.finish(created.id, { status: "COMPLETED", failureCode: "SESSION_LIMIT" });

    const savedMessages = await database.db
      .select({ sequence: messages.sequence, role: messages.role })
      .from(messages)
      .where(eq(messages.conversationId, created.id))
      .orderBy(messages.sequence);
    const [savedConversation] = await database.db
      .select({
        status: conversations.status,
        durationMs: conversations.durationMs,
        failureCode: conversations.failureCode,
      })
      .from(conversations)
      .where(eq(conversations.id, created.id));

    assert.equal(first, true);
    assert.equal(duplicate, false);
    assert.deepEqual(savedMessages, [
      { sequence: 1, role: "USER" },
      { sequence: 2, role: "ASSISTANT" },
    ]);
    assert.equal(savedConversation?.status, "COMPLETED");
    assert.equal(savedConversation?.failureCode, "SESSION_LIMIT");
    assert.ok((savedConversation?.durationMs ?? -1) >= 0);
  } finally {
    if (conversationId) await database.db.delete(conversations).where(eq(conversations.id, conversationId));
    await database.close();
  }
});

test("stale active conversations become abandoned", { skip: !databaseUrl }, async () => {
  const database = createDatabase(databaseUrl!, { max: 2 });
  const repository = new DrizzleConversationRepository(database.db);
  let conversationId: string | undefined;
  try {
    const created = await repository.create({
      roomName: `stale-${crypto.randomUUID()}`,
      runtimeSnapshot: { phase: 3, test: true },
    });
    conversationId = created.id;
    await repository.markActive(created.id);
    await database.db
      .update(conversations)
      .set({
        createdAt: new Date("2020-01-01T00:00:00Z"),
        startedAt: new Date("2020-01-01T00:00:00Z"),
      })
      .where(eq(conversations.id, created.id));

    assert.equal(await repository.abandonStale(new Date("2021-01-01T00:00:00Z")), 1);
    const [saved] = await database.db
      .select({
        status: conversations.status,
        failureCode: conversations.failureCode,
        durationMs: conversations.durationMs,
      })
      .from(conversations)
      .where(eq(conversations.id, created.id));
    assert.equal(saved?.status, "ABANDONED");
    assert.equal(saved?.failureCode, "STALE_SESSION");
    assert.ok((saved?.durationMs ?? 0) > 0);
  } finally {
    if (conversationId) await database.db.delete(conversations).where(eq(conversations.id, conversationId));
    await database.close();
  }
});

test("new settings affect only new conversation snapshots", { skip: !databaseUrl }, async () => {
  const database = createDatabase(databaseUrl!, { max: 2 });
  const agentRepository = new DrizzleAgentRepository(database.db);
  const conversationRepository = new DrizzleConversationRepository(database.db);
  const original = await agentRepository.get();
  const conversationIds: string[] = [];
  try {
    const before = await conversationRepository.create({
      roomName: `snapshot-before-${crypto.randomUUID()}`,
      runtimeSnapshot: { phase: 4, test: true },
    });
    conversationIds.push(before.id);
    await agentRepository.update({
      name: original.name,
      tone: "Concise",
      systemPrompt: "Du antwortest besonders knapp, klar und direkt auf die aktuelle Frage.",
    });
    const after = await conversationRepository.create({
      roomName: `snapshot-after-${crypto.randomUUID()}`,
      runtimeSnapshot: { phase: 4, test: true },
    });
    conversationIds.push(after.id);

    const beforeSnapshot = await conversationRepository.getAgentSnapshot(before.id) as { tone?: unknown };
    const afterSnapshot = await conversationRepository.getAgentSnapshot(after.id) as { tone?: unknown };
    assert.equal(beforeSnapshot.tone, original.tone);
    assert.equal(afterSnapshot.tone, "Concise");
  } finally {
    await agentRepository.update({
      name: original.name,
      tone: original.tone as "Friendly & Professional" | "Concise",
      systemPrompt: original.systemPrompt,
    });
    for (const id of conversationIds) {
      await database.db.delete(conversations).where(eq(conversations.id, id));
    }
    await database.close();
  }
});

test("damage report creation is transactional and idempotent by provider call id", { skip: !databaseUrl }, async () => {
  const database = createDatabase(databaseUrl!, { max: 2 });
  const conversationRepository = new DrizzleConversationRepository(database.db);
  const damageReportRepository = new DrizzleDamageReportRepository(database.db);
  let conversationId: string | undefined;
  try {
    const conversation = await conversationRepository.create({
      roomName: `damage-report-${crypto.randomUUID()}`,
      runtimeSnapshot: { phase: 5, test: true },
    });
    conversationId = conversation.id;
    const input = {
      conversationId: conversation.id,
      providerCallId: "provider-call-1",
      report: {
        category: "water" as const,
        description: "Im Bad tritt Wasser unter dem Waschbecken aus.",
        urgency: "high" as const,
      },
    };

    const [first, retry] = await Promise.all([
      damageReportRepository.create(input),
      damageReportRepository.create(input),
    ]);
    const savedCalls = await database.db.select().from(toolCalls).where(eq(toolCalls.conversationId, conversation.id));
    const savedReports = await database.db.select().from(damageReports).where(eq(damageReports.conversationId, conversation.id));

    assert.deepEqual(retry, first);
    assert.equal(savedCalls.length, 1);
    assert.equal(savedCalls[0]?.status, "SUCCEEDED");
    assert.deepEqual(savedCalls[0]?.result, { ok: true, damageReportId: first.damageReportId, status: "open" });
    assert.equal(savedReports.length, 1);
    assert.equal(savedReports[0]?.category, "WATER");
    assert.equal(savedReports[0]?.urgency, "HIGH");
    assert.equal(savedReports[0]?.toolCallId, savedCalls[0]?.id);

    const detail = await conversationRepository.getDetail(conversation.id);
    assert.equal(detail?.toolCalls.length, 1);
    assert.equal(detail?.toolCalls[0]?.damageReportId, first.damageReportId);
    assert.equal(detail?.toolCalls[0]?.damageDescription, input.report.description);
    assert.deepEqual(detail?.toolCalls[0]?.arguments, input.report);

    await assert.rejects(() => damageReportRepository.create({
      ...input,
      conversationId: crypto.randomUUID(),
      providerCallId: "orphan-provider-call",
    }));
    const orphanCalls = await database.db
      .select({ id: toolCalls.id })
      .from(toolCalls)
      .where(eq(toolCalls.providerCallId, "orphan-provider-call"));
    assert.equal(orphanCalls.length, 0);
  } finally {
    if (conversationId) await database.db.delete(conversations).where(eq(conversations.id, conversationId));
    await database.close();
  }
});
