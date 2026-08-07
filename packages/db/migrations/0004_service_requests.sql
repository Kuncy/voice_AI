CREATE TYPE "service_request_type" AS ENUM ('APPOINTMENT', 'BILLING');
--> statement-breakpoint
CREATE TYPE "service_request_status" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED');
--> statement-breakpoint
CREATE TABLE "service_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "tool_call_id" uuid NOT NULL UNIQUE REFERENCES "tool_calls"("id") ON DELETE CASCADE,
  "request_type" "service_request_type" NOT NULL,
  "reporter_name" text NOT NULL,
  "description" text NOT NULL,
  "street_and_house_number" text NOT NULL,
  "postal_code" text NOT NULL,
  "city" text NOT NULL,
  "preferred_timeframe" text,
  "status" "service_request_status" DEFAULT 'OPEN' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
