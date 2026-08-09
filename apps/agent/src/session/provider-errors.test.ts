import assert from "node:assert/strict";
import test from "node:test";
import { classifyProviderError, providerWarning } from "./provider-errors.js";

test("classifies provider rate limits and timeouts without leaking details to the notice", () => {
  assert.equal(
    classifyProviderError({ statusCode: 429, message: "quota exhausted for account 42" }).kind,
    "rate_limit",
  );
  assert.equal(classifyProviderError(new Error("request timed out")).kind, "timeout");
  assert.doesNotMatch(providerWarning("rate_limit"), /account 42/);
});

test("unknown provider errors use the generic recovery notice", () => {
  assert.equal(classifyProviderError({ message: "socket closed" }).kind, "other");
  assert.match(providerWarning("other"), /Verbindung wieder her/);
});
