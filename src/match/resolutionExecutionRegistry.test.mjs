import test from "node:test";
import assert from "node:assert/strict";
import { createResolutionExecutionRegistry } from "./resolutionExecutionRegistry.mjs";

test("runs one resolution and releases its key", () => {
  const registry = createResolutionExecutionRegistry();
  const context = { entryId: "entry-1", actionId: "action-1" };
  const result = registry.run(context, () => 42);
  assert.equal(result.status, "completed");
  assert.equal(result.value, 42);
  assert.equal(registry.isActive(context), false);
});

test("reports exceptions and releases its key", () => {
  const registry = createResolutionExecutionRegistry();
  const context = { entryId: "entry-1", actionId: "action-1" };
  const result = registry.run(context, () => { throw new Error("boom"); });
  assert.equal(result.status, "failed");
  assert.equal(result.error.message, "boom");
  assert.equal(registry.isActive(context), false);
});

test("rejects a concurrent execution of the same entry and action", () => {
  const registry = createResolutionExecutionRegistry();
  const context = { entryId: "entry-1", actionId: "action-1" };
  const nested = registry.run(context, () => registry.run(context, () => "second"));
  assert.equal(nested.status, "completed");
  assert.equal(nested.value.status, "already-active");
});
