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
  assert.equal(normalized.actions.interception.modifierCap, 0);
});


test("legacy Pass interception settings migrate into the separate Interception action", () => {
  const normalized = normalizeRuleSet({
    id: "legacy",
    schemaVersion: 2,
    name: "Legacy",
    actions: { pass: { modifierCap: 3, equalRollOutcome: "interception" } },
  });
  assert.equal(normalized.schemaVersion, 4);
  assert.equal(normalized.actions.interception.modifierCap, 3);
  assert.equal(normalized.actions.interception.equalRollOutcome, "interception");
  assert.equal(normalized.actions.interception.defenderRollStatId, "stat:interception");
});

test("Interception configuration normalizes independent modifier toggles", () => {
  const normalized = normalizeRuleSet({
    id: "custom-interception",
    schemaVersion: 3,
    name: "Custom Interception",
    actions: { interception: { useStandardModifiers: false, useProgressiveBonus: false, modifierCap: 7 } },
  });
  assert.equal(normalized.actions.interception.useStandardModifiers, false);
  assert.equal(normalized.actions.interception.useProgressiveBonus, false);
  assert.equal(normalized.actions.interception.modifierCap, 7);
});

test("Group Move rules are present by default and legacy Rule Sets receive stable defaults", () => {
  const defaultRules = createDefaultRuleSet();
  assert.deepEqual(defaultRules.actions.groupMove, {
    status: "configured", maxPlayers: 4, zoneLength: 10, maxDistance: 6, sameDirectionOnly: true,
  });
  const legacy = normalizeRuleSet({ id: "legacy-group", schemaVersion: 3, actions: {} });
  assert.deepEqual(legacy.actions.groupMove, defaultRules.actions.groupMove);
});
