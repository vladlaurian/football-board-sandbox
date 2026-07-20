import test from "node:test";
import assert from "node:assert/strict";
import { createMultiplayerTraceId, createMultiplayerTracer, multiplayerDebugEnabled } from "./debugTracer.mjs";

test("multiplayer tracer is disabled by default and supports explicit activation", () => {
  assert.equal(multiplayerDebugEnabled({}), false);
  assert.equal(multiplayerDebugEnabled({ DEBUG_MULTIPLAYER: true }), true);
  assert.equal(multiplayerDebugEnabled({ __DEBUG_MULTIPLAYER__: "1" }), true);
});

test("multiplayer tracer emits structured guard reasons", () => {
  const calls = [];
  const tracer = createMultiplayerTracer({ enabled: true, sink: { warn: (...args) => calls.push(args) } });
  tracer.guard("RESOLUTION_ABORTED", "not host", { traceId: "PASS_1" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].event, "RESOLUTION_ABORTED");
  assert.equal(calls[0][1].reason, "not host");
});

test("trace ids are unique and action-scoped", () => {
  const first = createMultiplayerTraceId("pass");
  const second = createMultiplayerTraceId("pass");
  assert.notEqual(first, second);
  assert.match(first, /^PASS_/);
});
