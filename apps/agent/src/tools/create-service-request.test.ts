import assert from "node:assert/strict";
import test from "node:test";
import { ServiceRequestService } from "@heyvera/core";
import { createServiceRequestTool } from "./create-service-request";

test("service request tool persists appointment data and publishes status", async () => {
  const serviceRequestId = crypto.randomUUID();
  let savedType: string | undefined;
  const service = new ServiceRequestService({
    async create(input) {
      savedType = input.request.requestType;
      return { serviceRequestId, status: "open" };
    },
  });
  const statuses: string[] = [];
  const tool = createServiceRequestTool({
    conversationId: crypto.randomUUID(),
    service,
    async publishStatus(event) {
      statuses.push(event.status);
    },
  });

  const result = await tool.execute({
    requestType: "appointment",
    reporterName: "Erika Muster",
    description: "Ich benötige einen Termin zur Besichtigung der Heizkörper.",
    streetAndHouseNumber: "Musterstraße 12",
    postalCode: "10115",
    city: "Berlin",
    preferredTimeframe: "Montagvormittag",
  }, {
    toolCallId: "service-call-42",
    ctx: {} as never,
    abortSignal: new AbortController().signal,
  });

  assert.equal(savedType, "appointment");
  assert.deepEqual(result, { ok: true, serviceRequestId, status: "open" });
  assert.deepEqual(statuses, ["started", "succeeded"]);
});
