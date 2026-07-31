import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../game/gameState.mjs";
import { createMatchContext } from "./matchContext.mjs";
import {
  activeTeamModifierTokens,
  consumeTeamModifierToken,
  grantTeamModifierToken,
  normalizeTeamModifierTokens,
} from "./rollModifierOpportunities.mjs";

const token = (id, team, modifierType, extra = {}) => ({
  id, team, modifierType, availableFromTurn: 2, expiresAfterTurn: 2,
  source: "test", sourceActionId: "test-action", ...extra,
});

test("legacy AV opportunities normalize into the canonical team token state", () => {
  const state = createGameState({ rollModifierOpportunities: [token("legacy-av", "blue", "advantage")] });
  assert.equal("rollModifierOpportunities" in state, false);
  assert.deepEqual(state.teamModifierTokens, [
    { ...token("legacy-av", "blue", "advantage"), rollScope: "owned-d20" },
  ]);
});

test("same-tier opposing team modifiers cancel while cross-tier tokens coexist", () => {
  const av = grantTeamModifierToken([], token("av", "blue", "advantage"));
  const cancelled = grantTeamModifierToken(av.tokens, token("dv", "blue", "disadvantage"));
  assert.equal(cancelled.kind, "cancelled");
  assert.equal(cancelled.cancelled.id, "av");
  assert.deepEqual(cancelled.tokens, []);

  const avm = grantTeamModifierToken([], token("avm", "blue", "majorAdvantage"));
  const dv = grantTeamModifierToken(avm.tokens, token("dv", "blue", "disadvantage"));
  assert.equal(dv.kind, "granted");
  assert.deepEqual(dv.tokens.map(item => item.modifierType), ["majorAdvantage", "disadvantage"]);
});

test("team modifier capacity is per team and rejects a fourth token without mutation", () => {
  const first = grantTeamModifierToken([], token("one", "blue", "advantage"), { capacity: 3 });
  const second = grantTeamModifierToken(first.tokens, token("two", "blue", "majorAdvantage"), { capacity: 3 });
  const third = grantTeamModifierToken(second.tokens, token("three", "blue", "advantage"), { capacity: 3 });
  const blocked = grantTeamModifierToken(third.tokens, token("four", "blue", "majorAdvantage"), { capacity: 3 });
  const red = grantTeamModifierToken(third.tokens, token("red-one", "red", "advantage"), { capacity: 3 });
  assert.equal(blocked.accepted, false);
  assert.equal(blocked.reason, "TEAM_MODIFIER_CAPACITY_REACHED");
  assert.deepEqual(blocked.tokens, third.tokens);
  assert.equal(red.tokens.filter(item => item.team === "red").length, 1);
});

test("DV and DVM are eligible canonical tokens and consume only when selected", () => {
  const tokens = normalizeTeamModifierTokens([
    token("dv", "blue", "disadvantage"),
    token("dvm", "blue", "majorDisadvantage"),
  ]);
  assert.deepEqual(activeTeamModifierTokens(tokens, "blue", 2).map(item => item.modifierType), ["disadvantage", "majorDisadvantage"]);
  const used = consumeTeamModifierToken(tokens, { team: "blue", turn: 2, modifierType: "majorDisadvantage" });
  assert.equal(used.accepted, true);
  assert.deepEqual(used.tokens.map(item => item.id), ["dv"]);
});

test("modifier capacity is frozen in MatchContext independently of later Tracker settings", () => {
  const context = createMatchContext({ trackerSettings: { teamModifierCapacity: 2 } });
  assert.equal(context.teamModifierCapacity, 2);
  assert.equal(createMatchContext({ trackerSettings: { teamModifierCapacity: 9 } }).teamModifierCapacity, 9);
  assert.equal(context.teamModifierCapacity, 2);
});
