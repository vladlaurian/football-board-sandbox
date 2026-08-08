import test from "node:test";
import assert from "node:assert/strict";
import { naturalRollOutcome, naturalRollOutcomeLine } from "./rollOutcomeEffects.mjs";

test("natural roll outcome preserves configured none, BA, AV and AVM effects without UI inference", () => {
  assert.deepEqual(naturalRollOutcome({ mechanic: "interception", natural: 20, effect: "none", team: "blue" }), { kind: "none", rawEffect: "none", team: "blue", natural: 20, mechanic: "interception" });
  assert.equal(naturalRollOutcome({ natural: 20, effect: "bonus-action", team: "red" }).kind, "bonus-action");
  const advantage = naturalRollOutcome({ natural: 20, effect: "next-turn-roll-advantage", team: "blue" });
  assert.equal(advantage.kind, "advantage");
  assert.equal(advantage.availability, "next-turn");
  assert.match(naturalRollOutcomeLine(advantage, { teamName: "Blue" }), /Advantage/);
  assert.equal(naturalRollOutcome({ natural: 20, effect: "current-turn-roll-major-advantage", team: "red" }).kind, "major-advantage");
});

test("the rendered line always names the natural roll that caused it, confirmed live with the user", () => {
  const twenty = naturalRollOutcome({ natural: 20, effect: "current-turn-roll-advantage", team: "red" });
  assert.equal(naturalRollOutcomeLine(twenty, { teamName: "Red" }), "Natural 20 — Red receives Advantage for one chosen roll this turn.");
  const one = naturalRollOutcome({ natural: 1, effect: "recoverer-bonus-action", team: "blue" });
  assert.equal(naturalRollOutcomeLine(one, { teamName: "Blue" }), "Natural 1 — Blue receives one Bonus Action before play resumes.");
});
