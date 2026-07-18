import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMatchActionState, normalizeTrackerSnapshot, TRACKER_ACTION_ABBR } from "./trackerState.mjs";

test("tracker snapshot keeps the current attacking-team field and clamps action economy", () => {
  const tracker = normalizeTrackerSnapshot({
    enabled: true,
    gameStarted: true,
    startingTeam: "blue",
    currentTurn: 999,
    turnPhase: "defense",
    settings: { attackActions: 6, defenseActions: 3, turns: 20 },
    usedActions: { blue: 99, red: 99 },
    actionLog: { blue: [{ id: "move", type: "MOVE", pieceId: "A-1" }], red: [{ type: "UNKNOWN" }] },
  });
  assert.equal(tracker.currentTurn, 20);
  assert.equal(tracker.usedActions.blue, 6);
  assert.equal(tracker.usedActions.red, 3);
  assert.equal(tracker.actionLog.red[0].type, "PASS");
  assert.equal(TRACKER_ACTION_ABBR.TACKLING, "TK");
});

test("legacy free-move state is safely migrated to explicit free mode", () => {
  const state = normalizeMatchActionState({
    byPieceId: { "A-1": { freeMoveAuthorized: true } },
  });
  assert.equal(state.freeMode.active, true);
  assert.equal(state.freeMode.pieceId, "A-1");
  assert.equal(state.freeMode.team, null);
});
