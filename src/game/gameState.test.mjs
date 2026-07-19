import assert from "node:assert/strict";
import test from "node:test";
import { createGameState, mergeGameState } from "./gameState.mjs";

function activeState() {
  return createGameState({
    gameMode: "match",
    actionResolution: { kind: "pass", status: "targeting" },
    actionContinuation: { kind: "bonus-card-action", team: "blue", status: "ready" },
    dice: { dieType: 20, blueResult: 20, redResult: 1 },
  });
}

test("omitted Timeline overrides preserve existing state", () => {
  const merged = mergeGameState(activeState(), {});
  assert.equal(merged.actionResolution.status, "targeting");
  assert.equal(merged.actionContinuation.status, "ready");
  assert.equal(merged.dice.blueResult, 20);
});

test("explicit null Timeline overrides clear nullable action and dice state", () => {
  const merged = mergeGameState(activeState(), {
    actionResolution: null,
    actionContinuation: null,
    blueDieResult: null,
    redDieResult: null,
  });
  assert.equal(merged.actionResolution, null);
  assert.equal(merged.actionContinuation, null);
  assert.equal(merged.dice.blueResult, null);
  assert.equal(merged.dice.redResult, null);
});
