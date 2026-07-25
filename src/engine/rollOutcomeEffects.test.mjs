import test from "node:test";
import assert from "node:assert/strict";
import { naturalRollOutcome, naturalRollOutcomeLine } from "./rollOutcomeEffects.mjs";

test("natural roll outcome preserves configured none, BA, AV and AVM effects without UI inference", () => {
  assert.deepEqual(naturalRollOutcome({ mechanic: "interception", natural: 20, effect: "none", team: "blue" }), { kind: "none", rawEffect: "none", team: "blue", mechanic: "interception" });
  assert.equal(naturalRollOutcome({ natural: 20, effect: "bonus-action", team: "red" }).kind, "bonus-action");
  const advantage = naturalRollOutcome({ natural: 20, effect: "next-turn-roll-advantage", team: "blue" });
  assert.equal(advantage.kind, "advantage");
  assert.equal(advantage.availability, "next-turn");
  assert.match(naturalRollOutcomeLine(advantage, { teamName: "Blue" }), /Advantage/);
  assert.equal(naturalRollOutcome({ natural: 20, effect: "current-turn-roll-major-advantage", team: "red" }).kind, "major-advantage");
});
