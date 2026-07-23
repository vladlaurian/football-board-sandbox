import test from "node:test";
import assert from "node:assert/strict";
import { resolveInterception } from "./interceptionEngine.mjs";

test("generic Interception uses defender and attacker values without Pass-specific names", () => {
  const result = resolveInterception({
    natural: 10,
    defenderStatValue: 2,
    attackerTargetValue: 11,
    modifierCap: 4,
  });
  assert.equal(result.total, 12);
  assert.equal(result.outcome, "interception");
});

test("equal total outcome is configurable", () => {
  const passContinues = resolveInterception({ natural: 10, defenderStatValue: 1, attackerTargetValue: 11, modifierCap: 4 });
  const interception = resolveInterception({ natural: 10, defenderStatValue: 1, attackerTargetValue: 11, modifierCap: 4, equalRollOutcome: "interception" });
  assert.equal(passContinues.outcome, "pass-continues");
  assert.equal(interception.outcome, "interception");
});

test("Natural 1 and Natural 20 remain invariant", () => {
  assert.equal(resolveInterception({ natural: 1, defenderStatValue: 99, attackerTargetValue: 0, modifierCap: 4 }).outcome, "pass-continues");
  assert.equal(resolveInterception({ natural: 20, defenderStatValue: 0, attackerTargetValue: 99, modifierCap: 4 }).outcome, "natural-20-interception");
});
