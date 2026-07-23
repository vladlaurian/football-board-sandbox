import assert from "node:assert/strict";
import test from "node:test";
import { createEditorStateAfterMatchExit, createGameState, mergeGameState } from "./gameState.mjs";

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

test("leaving Match creates an Editor state without Match-only interaction locks", () => {
  const exited = createEditorStateAfterMatchExit(createGameState({
    gameMode: "match",
    actionResolution: { kind: "pass", status: "targeting" },
    actionContinuation: { id: "bonus-1", kind: "bonus-card-action", team: "blue", status: "ready" },
    tracker: {
      matchActionState: {
        freeMode: { active: true, pieceId: "blue-1", team: "blue", timelineGroupId: "free-1" },
        groupMove: { active: true, team: "blue", zoneStartX: 2, zoneLength: 6, maxPlayers: 4, maxDistance: 6, movedPieceIds: ["blue-1"] },
        activeMovement: { active: true, kind: "normal-move", pieceId: "blue-2", team: "blue", timelineGroupId: "move-1" },
      },
    },
  }));
  assert.equal(exited.gameMode, "editor");
  assert.equal(exited.actionResolution, null);
  assert.equal(exited.actionContinuation, null);
  assert.equal(exited.tracker.matchActionState.freeMode.active, false);
  assert.equal(exited.tracker.matchActionState.groupMove.active, false);
  assert.equal(exited.tracker.matchActionState.activeMovement.active, false);
});
