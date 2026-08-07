CREATE TYPE "tool_call_status" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED');
--> statement-breakpoint
CREATE TYPE "damage_category" AS ENUM ('HEATING', 'WATER', 'ELECTRICITY', 'STRUCTURAL', 'OTHER');
--> statement-breakpoint
CREATE TYPE "damage_urgency" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'EMERGENCY');
--> statement-breakpoint
CREATE TYPE "damage_report_status" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED');
--> statement-breakpoint
CREATE TABLE "tool_calls" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "message_id" uuid REFERENCES "messages"("id") ON DELETE SET NULL,
  "provider_call_id" text NOT NULL,
  "tool_name" text NOT NULL,
  "arguments" jsonb NOT NULL,
  "result" jsonb,
  "status" "tool_call_status" DEFAULT 'STARTED' NOT NULL,
  "error_code" text,
  "duration_ms" integer,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "completed_at" timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tool_calls_conversation_provider_call_unique" ON "tool_calls" ("conversation_id", "provider_call_id");
--> statement-breakpoint
CREATE TABLE "damage_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "tool_call_id" uuid NOT NULL UNIQUE REFERENCES "tool_calls"("id") ON DELETE CASCADE,
  "category" "damage_category" NOT NULL,
  "description" text NOT NULL,
  "urgency" "damage_urgency" NOT NULL,
  "status" "damage_report_status" DEFAULT 'OPEN' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
