CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE TYPE "conversation_status" AS ENUM ('STARTING', 'ACTIVE', 'COMPLETED', 'FAILED', 'ABANDONED');
--> statement-breakpoint
CREATE TYPE "message_role" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');
--> statement-breakpoint
CREATE TABLE "agents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "language" text DEFAULT 'de' NOT NULL,
  "tone" text NOT NULL,
  "system_prompt" text NOT NULL,
  "tts_model" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id"),
  "livekit_room_name" text NOT NULL,
  "status" "conversation_status" DEFAULT 'STARTING' NOT NULL,
  "started_at" timestamptz,
  "ended_at" timestamptz,
  "duration_ms" integer,
  "agent_snapshot" jsonb NOT NULL,
  "runtime_snapshot" jsonb NOT NULL,
  "failure_code" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_livekit_room_name_unique" ON "conversations" ("livekit_room_name");
--> statement-breakpoint
CREATE INDEX "conversations_created_at_idx" ON "conversations" ("created_at");
--> statement-breakpoint
CREATE TABLE "messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "external_item_id" text NOT NULL,
  "sequence" integer NOT NULL,
  "role" "message_role" NOT NULL,
  "content" text NOT NULL,
  "is_final" boolean NOT NULL,
  "was_interrupted" boolean DEFAULT false NOT NULL,
  "started_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "metadata" jsonb
);
--> statement-breakpoint
CREATE UNIQUE INDEX "messages_conversation_external_item_unique" ON "messages" ("conversation_id", "external_item_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "messages_conversation_sequence_unique" ON "messages" ("conversation_id", "sequence");
--> statement-breakpoint
INSERT INTO "agents" ("id", "name", "language", "tone", "system_prompt", "tts_model")
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'Vera',
  'de',
  'Friendly & Professional',
  'Du bist Vera, eine freundliche und professionelle deutschsprachige Sprachassistentin. Antworte kurz, klar und natürlich.',
  'aura-2-viktoria-de'
)
ON CONFLICT ("id") DO NOTHING;
