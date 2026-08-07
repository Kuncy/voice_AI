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
export const toolCallStatus = pgEnum("tool_call_status", ["STARTED", "SUCCEEDED", "FAILED"]);
export const damageCategory = pgEnum("damage_category", ["HEATING", "WATER", "ELECTRICITY", "STRUCTURAL", "OTHER"]);
export const damageUrgency = pgEnum("damage_urgency", ["LOW", "MEDIUM", "HIGH", "EMERGENCY"]);
export const damageReportStatus = pgEnum("damage_report_status", ["OPEN", "IN_REVIEW", "RESOLVED"]);
export const serviceRequestType = pgEnum("service_request_type", ["APPOINTMENT", "BILLING"]);
export const serviceRequestStatus = pgEnum("service_request_status", ["OPEN", "IN_REVIEW", "RESOLVED"]);

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

export const toolCalls = pgTable(
  "tool_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "set null" }),
    providerCallId: text("provider_call_id").notNull(),
    toolName: text("tool_name").notNull(),
    arguments: jsonb("arguments").notNull(),
    result: jsonb("result"),
    status: toolCallStatus("status").notNull().default("STARTED"),
    errorCode: text("error_code"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("tool_calls_conversation_provider_call_unique").on(table.conversationId, table.providerCallId),
  ],
);

export const damageReports = pgTable("damage_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  toolCallId: uuid("tool_call_id").notNull().unique().references(() => toolCalls.id, { onDelete: "cascade" }),
  reporterName: text("reporter_name"),
  category: damageCategory("category").notNull(),
  description: text("description").notNull(),
  urgency: damageUrgency("urgency").notNull(),
  streetAndHouseNumber: text("street_and_house_number"),
  postalCode: text("postal_code"),
  city: text("city"),
  status: damageReportStatus("status").notNull().default("OPEN"),
  ...timestamps,
});

export const serviceRequests = pgTable("service_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  toolCallId: uuid("tool_call_id").notNull().unique().references(() => toolCalls.id, { onDelete: "cascade" }),
  requestType: serviceRequestType("request_type").notNull(),
  reporterName: text("reporter_name").notNull(),
  description: text("description").notNull(),
  streetAndHouseNumber: text("street_and_house_number").notNull(),
  postalCode: text("postal_code").notNull(),
  city: text("city").notNull(),
  preferredTimeframe: text("preferred_timeframe"),
  status: serviceRequestStatus("status").notNull().default("OPEN"),
  ...timestamps,
});

export const agentRelations = relations(agents, ({ many }) => ({ conversations: many(conversations) }));
export const conversationRelations = relations(conversations, ({ one, many }) => ({
  agent: one(agents, { fields: [conversations.agentId], references: [agents.id] }),
  messages: many(messages),
  toolCalls: many(toolCalls),
  damageReports: many(damageReports),
  serviceRequests: many(serviceRequests),
}));
export const messageRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
}));
export const toolCallRelations = relations(toolCalls, ({ one }) => ({
  conversation: one(conversations, { fields: [toolCalls.conversationId], references: [conversations.id] }),
  message: one(messages, { fields: [toolCalls.messageId], references: [messages.id] }),
  damageReport: one(damageReports),
  serviceRequest: one(serviceRequests),
}));
export const damageReportRelations = relations(damageReports, ({ one }) => ({
  conversation: one(conversations, { fields: [damageReports.conversationId], references: [conversations.id] }),
  toolCall: one(toolCalls, { fields: [damageReports.toolCallId], references: [toolCalls.id] }),
}));
export const serviceRequestRelations = relations(serviceRequests, ({ one }) => ({
  conversation: one(conversations, { fields: [serviceRequests.conversationId], references: [conversations.id] }),
  toolCall: one(toolCalls, { fields: [serviceRequests.toolCallId], references: [toolCalls.id] }),
}));
