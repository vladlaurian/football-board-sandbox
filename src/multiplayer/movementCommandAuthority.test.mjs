import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../main.jsx", import.meta.url), "utf8");

test("generic movement input never falls back to canonical active interaction piece", () => {
  assert.match(source, /function moveSelectedPieceTo\(x, y\)[\s\S]*find\(item => item\.id === selectedId\)/);
  assert.doesNotMatch(source, /interactionState\.activePieceId \|\| selectedId/);
});

test("guest normal and group movement starts are host-authoritative", () => {
  assert.match(source, /requestHostActionStart\(\{ mode: "tracker-action", actionType: type, piece \}\)/);
  assert.match(source, /intent\.mode === "tracker-action"/);
  assert.match(source, /commitTrackerActionActivation\(actionType, piece\)/);
});

test("guest movement steps use the common command path", () => {
  assert.match(source, /sessionRuntimeRef\(sessionCode\.toUpperCase\(\), "gameplayCommand"\)/);
  assert.match(source, /GAMEPLAY_ACTION_TYPE\.BONUS_MOVE/);
  assert.match(source, /GAMEPLAY_ACTION_TYPE\.GROUP_MOVE/);
  assert.match(source, /GAMEPLAY_ACTION_TYPE\.THREE_TWO/);
  assert.match(source, /GAMEPLAY_ACTION_TYPE\.FREE_MOVE/);
  assert.match(source, /routeGameplayCommand\(command/);
});


test("live canonical hydration preserves a valid local movement selection", () => {
  assert.match(source, /shouldPreserveLocalSelectionDuringTimelineHydration/);
  assert.match(source, /preserveLocalSelection: reconciliationMode === "restore"[\s\S]*sessionActive: Boolean\(sessionCode\)/);
});
