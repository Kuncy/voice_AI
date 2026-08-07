import assert from "node:assert/strict";
import test from "node:test";
import { DamageReportService } from "@heyvera/core";
import { createDamageReportTool } from "./create-damage-report";

test("damage report tool forwards the provider call id and publishes lifecycle status", async () => {
  const damageReportId = crypto.randomUUID();
  let savedProviderCallId: string | undefined;
  const service = new DamageReportService({
    async create(input) {
      savedProviderCallId = input.providerCallId;
      return { damageReportId, status: "open" };
    },
  });
  const statuses: string[] = [];
  const tool = createDamageReportTool({
    conversationId: crypto.randomUUID(),
    service,
    async publishStatus(event) {
      statuses.push(event.status);
    },
  });

  const result = await tool.execute(
    {
      category: "water",
      description: "Wasser tritt unter dem Waschbecken aus.",
      urgency: "high",
    },
    {
      toolCallId: "provider-call-42",
      ctx: {} as never,
      abortSignal: new AbortController().signal,
    },
  );

  assert.equal(savedProviderCallId, "provider-call-42");
  assert.deepEqual(result, { ok: true, damageReportId, status: "open" });
  assert.deepEqual(statuses, ["started", "succeeded"]);
});
