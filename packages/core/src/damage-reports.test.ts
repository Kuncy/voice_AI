import assert from "node:assert/strict";
import test from "node:test";
import { DamageReportService, type DamageReportRepository } from "./damage-reports";

const validReport = {
  category: "water" as const,
  description: "Wasser tritt unter dem Waschbecken aus.",
  urgency: "high" as const,
};

test("damage report service validates before persistence", async () => {
  let calls = 0;
  const repository: DamageReportRepository = {
    async create() {
      calls += 1;
      return { damageReportId: crypto.randomUUID(), status: "open" };
    },
  };
  const service = new DamageReportService(repository);

  assert.deepEqual(await service.create({
    conversationId: crypto.randomUUID(),
    providerCallId: "call-invalid",
    report: { ...validReport, description: "zu kurz" },
  }), { ok: false, code: "VALIDATION_ERROR" });
  assert.equal(calls, 0);
});

test("damage report service returns stable success and persistence errors", async () => {
  const damageReportId = crypto.randomUUID();
  const success = new DamageReportService({
    async create() {
      return { damageReportId, status: "open" };
    },
  });
  assert.deepEqual(await success.create({
    conversationId: crypto.randomUUID(),
    providerCallId: "call-success",
    report: validReport,
  }), { ok: true, damageReportId, status: "open" });

  const failure = new DamageReportService({
    async create() {
      throw new Error("database details must not escape");
    },
  });
  assert.deepEqual(await failure.create({
    conversationId: crypto.randomUUID(),
    providerCallId: "call-failure",
    report: validReport,
  }), { ok: false, code: "PERSISTENCE_ERROR" });
});
