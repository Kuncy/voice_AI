import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const conversationStatus = pgEnum("conversation_status", [
  "STARTING",
  "ACTIVE",
  "COMPLETED",
  "FAILED",
  "ABANDONED",
]);
export const messageRole = pgEnum("message_role", ["USER", "ASSISTANT", "SYSTEM", "TOOL"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  language: text("language").notNull().default("de"),
  tone: text("tone").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  ttsModel: text("tts_model"),
  ...timestamps,
});

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull().references(() => agents.id),
    livekitRoomName: text("livekit_room_name").notNull(),
    status: conversationStatus("status").notNull().default("STARTING"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    agentSnapshot: jsonb("agent_snapshot").notNull(),
    runtimeSnapshot: jsonb("runtime_snapshot").notNull(),
    failureCode: text("failure_code"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("conversations_livekit_room_name_unique").on(table.livekitRoomName),
    index("conversations_created_at_idx").on(table.createdAt),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    externalItemId: text("external_item_id").notNull(),
    sequence: integer("sequence").notNull(),
    role: messageRole("role").notNull(),
    content: text("content").notNull(),
    isFinal: boolean("is_final").notNull(),
    wasInterrupted: boolean("was_interrupted").notNull().default(false),
    startedAt: timestamp("started_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb("metadata"),
  },
  (table) => [
    uniqueIndex("messages_conversation_external_item_unique").on(table.conversationId, table.externalItemId),
    uniqueIndex("messages_conversation_sequence_unique").on(table.conversationId, table.sequence),
  ],
);

export const agentRelations = relations(agents, ({ many }) => ({ conversations: many(conversations) }));
export const conversationRelations = relations(conversations, ({ one, many }) => ({
  agent: one(agents, { fields: [conversations.agentId], references: [agents.id] }),
  messages: many(messages),
}));
export const messageRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
}));
