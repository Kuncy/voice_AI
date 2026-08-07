import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { createDatabase } from "./client";
import { DrizzleConversationRepository } from "./repository";
import { conversations, messages } from "./schema";

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
