import assert from "node:assert/strict";
import test from "node:test";
import { sumAndCapRollModifier } from "./rollModifierMath.mjs";

test("sums every source, including a rolling subject's own card stat, before capping", () => {
  const sources = [
    { value: 7, source: "card" },
    { value: -3, source: "non-preferred-foot" },
    { value: -1, source: "defensive-area" },
  ];
  const result = sumAndCapRollModifier(sources, 4);
  assert.equal(result.rawModifier, 3);
  assert.equal(result.modifier, 3);
  assert.equal(result.capped, false);
});

test("caps symmetrically once the combined total exceeds the frozen cap in either direction", () => {
  const negative = sumAndCapRollModifier([{ value: 0 }, { value: -8 }], 4);
  assert.equal(negative.rawModifier, -8);
  assert.equal(negative.modifier, -4);
  assert.equal(negative.capped, true);

  const positive = sumAndCapRollModifier([{ value: 10 }, { value: 2 }], 4);
  assert.equal(positive.rawModifier, 12);
  assert.equal(positive.modifier, 4);
  assert.equal(positive.capped, true);
});

test("a zero or missing cap means no maximum — the sum is applied uncapped, not collapsed to zero", () => {
  const zeroCap = sumAndCapRollModifier([{ value: 5 }], 0);
  assert.equal(zeroCap.modifier, 5);
  assert.equal(zeroCap.rawModifier, 5);
  assert.equal(zeroCap.capped, false);
  assert.equal(zeroCap.modifierCap, 0);

  const missingCap = sumAndCapRollModifier([{ value: 5 }], undefined);
  assert.equal(missingCap.modifierCap, 0);
  assert.equal(missingCap.modifier, 5);

  const uncappedNegative = sumAndCapRollModifier([{ value: -30 }], 0);
  assert.equal(uncappedNegative.modifier, -30, "no maximum applies symmetrically in both directions");
});

test("ignores non-numeric or missing source values instead of producing NaN", () => {
  const result = sumAndCapRollModifier([{ value: "not-a-number" }, {}, { value: 2 }], 4);
  assert.equal(result.rawModifier, 2);
  assert.equal(result.modifier, 2);
});

test("an empty or non-array source list is a neutral zero modifier", () => {
  assert.equal(sumAndCapRollModifier([], 4).modifier, 0);
  assert.equal(sumAndCapRollModifier(null, 4).modifier, 0);
});
