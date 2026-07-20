import test from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultRuleSet,
  createRuleSet,
  findRuleSet,
  normalizeRuleSet,
  normalizeRuleSets,
} from "./ruleSets.mjs";

test("a Rule Set always keeps dice resolution manual", () => {
  const normalized = normalizeRuleSet({
    id: "custom",
    name: "Custom",
    actions: { pass: { status: "configured", rollMode: "automatic" } },
  });
  assert.equal(normalized.actions.pass.status, "configured");
  assert.equal(normalized.actions.pass.rollMode, "manual");
});

test("Rule Set library has a stable default and unique duplicate ids", () => {
  const defaultRuleSet = createDefaultRuleSet();
  const library = normalizeRuleSets([]);
  const duplicate = createRuleSet(library, "Default Rules", defaultRuleSet);
  const fullLibrary = normalizeRuleSets([...library, duplicate]);
  assert.equal(fullLibrary.length, 2);
  assert.notEqual(fullLibrary[0].id, fullLibrary[1].id);
  assert.equal(findRuleSet(fullLibrary, duplicate.id).name, "Default Rules");
});


test("Rule Set normalization preserves an explicit zero modifier cap", () => {
  const normalized = normalizeRuleSet({
    id: "zero-cap",
    name: "Zero Cap",
    actions: { pass: { status: "configured", modifierCap: 0 } },
  });
  assert.equal(normalized.actions.pass.modifierCap, 0);
});
