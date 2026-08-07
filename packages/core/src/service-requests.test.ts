import assert from "node:assert/strict";
import test from "node:test";
import { ServiceRequestService, type ServiceRequestRepository } from "./service-requests";

const billingRequest = {
  requestType: "billing" as const,
  reporterName: "Samaster",
  description: "Ich habe eine Frage zu einer Position in der Nebenkostenabrechnung.",
  streetAndHouseNumber: "Musterstraße 12",
  postalCode: "10115",
  city: "Berlin",
  preferredTimeframe: null,
};

test("service request validates type-specific input before persistence", async () => {
  let calls = 0;
  const repository: ServiceRequestRepository = {
    async create() {
      calls += 1;
      return { serviceRequestId: crypto.randomUUID(), status: "open" };
    },
  };
  const service = new ServiceRequestService(repository);

  assert.deepEqual(await service.create({
    conversationId: crypto.randomUUID(),
    providerCallId: "invalid-appointment",
    request: { ...billingRequest, requestType: "appointment", preferredTimeframe: null },
  }), { ok: false, code: "VALIDATION_ERROR" });
  assert.equal(calls, 0);
});

test("service request persists valid billing and appointment requests", async () => {
  const saved: string[] = [];
  const service = new ServiceRequestService({
    async create(input) {
      saved.push(input.request.requestType);
      return { serviceRequestId: crypto.randomUUID(), status: "open" };
    },
  });

  assert.equal((await service.create({
    conversationId: crypto.randomUUID(),
    providerCallId: "billing-call",
    request: billingRequest,
  })).ok, true);
  assert.equal((await service.create({
    conversationId: crypto.randomUUID(),
    providerCallId: "appointment-call",
    request: { ...billingRequest, requestType: "appointment", preferredTimeframe: "Montagvormittag" },
  })).ok, true);
  assert.deepEqual(saved, ["billing", "appointment"]);
});
