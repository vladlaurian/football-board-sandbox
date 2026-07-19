import assert from "node:assert/strict";
import test from "node:test";
import {
  createDelayedResolution,
  delayedResolutionAtCursor,
  delayedResolutionRemaining,
} from "./delayedResolution.mjs";

const pendingPass = { id: "pass-1", kind: "pass", status: "awaiting-interception-roll" };
const request = createDelayedResolution({
  kind: "pass-interception",
  actionId: "pass-1",
  team: "blue",
  value: 20,
  delayMs: 2000,
  createdAt: 1000,
  payload: { defenderId: "blue-st" },
});

test("creates a serializable cosmetic deadline without changing gameplay state", () => {
  assert.equal(request.resolveAt, 3000);
  assert.equal(request.actionId, "pass-1");
  assert.deepEqual(request.payload, { defenderId: "blue-st" });
  assert.equal(pendingPass.status, "awaiting-interception-roll");
});

test("derives a pending resolution only from the applied DICE_ROLLED entry", () => {
  const rollEntry = { id: "roll-1", type: "DICE_ROLLED", metadata: { delayedResolution: request } };
  const resultEntry = { id: "result-1", type: "PASS_NATURAL_20", metadata: {} };
  const timeline = { cursor: 1, entries: [rollEntry, resultEntry] };
  assert.equal(delayedResolutionAtCursor(timeline, pendingPass)?.entryId, "roll-1");
  assert.equal(delayedResolutionAtCursor({ ...timeline, cursor: 0 }, pendingPass), null);
  assert.equal(delayedResolutionAtCursor({ ...timeline, cursor: 2 }, pendingPass), null);
  assert.equal(delayedResolutionAtCursor(timeline, { ...pendingPass, id: "another-pass" }), null);
});

test("Undo and Redo deterministically remove and restore the remaining delay", () => {
  assert.equal(delayedResolutionRemaining(request, 1500), 1500);
  assert.equal(delayedResolutionRemaining(request, 4000), 0);
});
