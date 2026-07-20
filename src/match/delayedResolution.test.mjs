import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalDelayedResolutionContext,
  createDelayedResolution,
  diagnoseCanonicalDelayedResolution,
  delayedResolutionAtCursor,
  delayedResolutionRemaining,
  shouldScheduleCanonicalDelayedResolution,
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


test("only the host schedules a canonical multiplayer resolution at the live cursor", () => {
  const timeline = { cursor: 1, entries: [{ id: "roll-1" }] };
  const args = { sessionActive: true, isHost: true, timeline, request: { entryId: "roll-1" } };
  assert.equal(shouldScheduleCanonicalDelayedResolution(args), true);
  assert.equal(shouldScheduleCanonicalDelayedResolution({ ...args, isHost: false }), false);
  assert.equal(shouldScheduleCanonicalDelayedResolution({ ...args, replayMode: true }), false);
  assert.equal(shouldScheduleCanonicalDelayedResolution({ ...args, sessionEnding: true }), false);
  assert.equal(shouldScheduleCanonicalDelayedResolution({ ...args, timeline: { ...timeline, cursor: 0 } }), false);
});


test("host resolution context is derived from the canonical cursor state", () => {
  const rollEntry = {
    id: "roll-1",
    type: "DICE_ROLLED",
    metadata: { delayedResolution: request },
    after: { actionResolution: pendingPass },
  };
  const context = canonicalDelayedResolutionContext({ cursor: 1, entries: [rollEntry] });
  assert.equal(context?.request?.entryId, "roll-1");
  assert.equal(context?.actionResolution?.id, "pass-1");
  assert.equal(canonicalDelayedResolutionContext({ cursor: 0, entries: [rollEntry] }), null);
  assert.equal(canonicalDelayedResolutionContext({ cursor: 1, entries: [rollEntry, { id: "later" }] }), null);
});


test("diagnoses the exact canonical-request rejection without mutating gameplay", () => {
  const rollEntry = {
    id: "roll-1",
    type: "DICE_ROLLED",
    metadata: { delayedResolution: request },
    after: { actionResolution: pendingPass },
  };
  const live = diagnoseCanonicalDelayedResolution({ revision: 7, cursor: 1, entries: [rollEntry] }, "roll-1");
  assert.equal(live.reason, "canonical-context-found");
  assert.equal(live.canonicalFound, true);
  assert.equal(live.cursorEntryRequestId, "");

  const undone = diagnoseCanonicalDelayedResolution({ revision: 8, cursor: 0, entries: [rollEntry] }, "roll-1");
  assert.equal(undone.reason, "cursor-is-zero");
  assert.equal(undone.expectedEntryApplied, false);

  const laterEntry = { id: "later", type: "PLAYER_MOVED", after: { actionResolution: pendingPass } };
  const stale = diagnoseCanonicalDelayedResolution({ revision: 9, cursor: 2, entries: [rollEntry, laterEntry] }, "roll-1");
  assert.equal(stale.reason, "cursor-entry-is-not-dice-roll");
  assert.equal(stale.expectedEntryIndex, 0);
  assert.equal(stale.cursorEntryId, "later");

  const mismatchEntry = {
    ...rollEntry,
    after: { actionResolution: { ...pendingPass, id: "pass-2" } },
  };
  const mismatch = diagnoseCanonicalDelayedResolution({ cursor: 1, entries: [mismatchEntry] }, "roll-1");
  assert.equal(mismatch.reason, "action-id-mismatch");
  assert.equal(mismatch.cursorEntryActionId, "pass-1");
  assert.equal(mismatch.actionResolutionId, "pass-2");
});
