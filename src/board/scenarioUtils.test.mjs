import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultScenarioSlots, normalizeScenarioSlots } from "./scenarioUtils.mjs";

test("Scenario slots migrate the old default Romanian names while preserving saved snapshots", () => {
  const snapshot = { pieces: [{ id: "A-1" }] };
  const slots = normalizeScenarioSlots([
    { id: 1, name: "Situația 1", snapshot },
    { id: 2, name: "Counter attack", snapshot: null },
  ], createDefaultScenarioSlots(3));
  assert.equal(slots[0].name, "Scenario 1");
  assert.equal(slots[0].snapshot, snapshot);
  assert.equal(slots[1].name, "Counter attack");
  assert.equal(slots[2].name, "Scenario 3");
});
