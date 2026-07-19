import test from "node:test";
import assert from "node:assert/strict";
import {
  consumeActionEvent,
  createPendingDecision,
  createPendingRoll,
  createRollEvent,
  hasConsumedActionEvent,
  rollEventMatchesPendingRoll,
  withPendingDecision,
  withPendingRoll,
} from "./actionResolutionEngine.mjs";

function request(index, requestId = `request-${index}`) {
  return createPendingRoll({ requestId, actionId: "pass-1", team: "blue", subjectId: `def-${index}`, reactionIndex: index });
}
function event(index, id, natural = 8, requestId = `request-${index}`) {
  return createRollEvent({ id, requestId, actionId: "pass-1", team: "blue", subjectId: `def-${index}`, reactionIndex: index, natural });
}

test("two consecutive rolls with the same natural are distinct events", () => {
  let flow = withPendingRoll({ id: "pass-1", consumedEventIds: [] }, request(0));
  flow = consumeActionEvent(flow, event(0, "roll-a", 8));
  assert.equal(flow.lastRollEvent.natural, 8);
  assert.ok(hasConsumedActionEvent(flow, "roll-a"));
  flow = withPendingRoll(flow, request(1));
  flow = consumeActionEvent(flow, event(1, "roll-b", 8));
  assert.equal(flow.lastRollEvent.natural, 8);
  assert.deepEqual(flow.consumedEventIds, ["roll-a", "roll-b"]);
});

test("the same roll event cannot be consumed twice", () => {
  const pending = request(0);
  const first = consumeActionEvent(withPendingRoll({ id: "pass-1", consumedEventIds: [] }, pending), event(0, "roll-a"));
  const replayed = consumeActionEvent(withPendingRoll(first, pending), event(0, "roll-a"));
  assert.equal(replayed, null);
});

test("a roll must match request, action, team, subject and reaction index", () => {
  const pending = request(2);
  assert.equal(rollEventMatchesPendingRoll(event(2, "ok"), pending), true);
  assert.equal(rollEventMatchesPendingRoll(event(1, "wrong"), pending), false);
});

test("pending decisions are explicit and replace pending rolls", () => {
  const decision = createPendingDecision({ id: "decision-1", type: "CHOOSE_INTERCEPTOR", team: "red", options: [{ id: "a" }, { id: "b" }] });
  const flow = withPendingDecision(withPendingRoll({ id: "pass-1" }, request(0)), decision);
  assert.equal(flow.pendingRoll, null);
  assert.equal(flow.pendingDecision.id, "decision-1");
  assert.equal(flow.pendingDecision.options.length, 2);
});

test("six sequential interceptor requests remain independently consumable", () => {
  let flow = { id: "pass-1", consumedEventIds: [] };
  for (let index = 0; index < 6; index += 1) {
    flow = withPendingRoll(flow, request(index));
    flow = consumeActionEvent(flow, event(index, `roll-${index}`, 5));
    assert.ok(flow);
  }
  assert.equal(flow.consumedEventIds.length, 6);
});
