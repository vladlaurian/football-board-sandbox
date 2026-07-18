import assert from "node:assert/strict";
import test from "node:test";
import {
  activateTrackerAction,
  activeTeamForTrackerPhase,
  canUseTrackerActionForPiece,
  createEmptyTrackerTurnState,
  hasGroupMoveAuthorization,
  movementAuthorizationForPiece,
  nextTrackerPhase,
  toggleFreeModeState,
  trackerActionStatusForTeam,
  trackerPhaseBlockReason,
  trackerRoleForTeam,
} from "./actionRules.mjs";

function tracker(overrides = {}) {
  return {
    gameStarted: true,
    startingTeam: "blue",
    currentTurn: 1,
    usedActions: { blue: 0, red: 0 },
    actionLog: { blue: [], red: [] },
    matchActionState: {},
    turnPhase: "attack",
    settings: { attackActions: 5, defenseActions: 4, turns: 20 },
    ...overrides,
  };
}

test("phase ownership and action economy remain independent of the UI", () => {
  const state = tracker();
  assert.equal(trackerRoleForTeam(state, "blue"), "attack");
  assert.equal(trackerRoleForTeam(state, "red"), "defense");
  assert.equal(activeTeamForTrackerPhase(state), "blue");
  assert.equal(activeTeamForTrackerPhase(state, "defense"), "red");
  assert.deepEqual(trackerActionStatusForTeam(state, "blue", { blue: 4 }), {
    limit: 5,
    used: 4,
    remaining: 1,
    exhausted: false,
  });
  assert.equal(nextTrackerPhase("attack"), "defense");
  assert.equal(nextTrackerPhase("defense"), "complete");
  assert.equal(trackerPhaseBlockReason("complete"), "all-actions-complete");
});

test("action activation produces a reusable state transition", () => {
  const pass = activateTrackerAction(tracker(), {
    type: "PASS",
    pieceId: "A-9",
    team: "blue",
    entryId: "pass-1",
  });
  assert.equal(pass.allowed, true);
  assert.equal(pass.actionLog.blue[0].type, "PASS");
  assert.equal(pass.usedActions.blue, 1);

  const move = activateTrackerAction(tracker(), {
    type: "MOVE",
    pieceId: "A-9",
    team: "blue",
    entryId: "move-1",
  });
  assert.equal(move.matchActionState.byPieceId["A-9"].moveAuthorized, true);
  assert.equal(move.matchActionState.byPieceId["A-9"].moveGroupId, "move-1");
});

test("group move remains available only as the final action", () => {
  const fourActions = [0, 1, 2, 3].map(index => ({ id: `pass-${index}`, type: "PASS", pieceId: "A-9" }));
  const beforeLastAction = tracker({
    usedActions: { blue: 4, red: 0 },
    actionLog: { blue: fourActions, red: [] },
  });
  const groupMove = activateTrackerAction(beforeLastAction, {
    type: "GROUP_MOVE",
    pieceId: "A-9",
    team: "blue",
    entryId: "group-1",
  });
  assert.equal(groupMove.allowed, true);
  assert.equal(hasGroupMoveAuthorization({
    ...beforeLastAction,
    usedActions: groupMove.usedActions,
    actionLog: groupMove.actionLog,
    matchActionState: groupMove.matchActionState,
  }, "blue"), true);

  const tooEarly = activateTrackerAction(tracker(), {
    type: "GROUP_MOVE",
    pieceId: "A-9",
    team: "blue",
    entryId: "group-early",
  });
  assert.equal(tooEarly.reason, "group-move-last-action-only");
});

test("movement authorization selects normal, free, group, and blocked modes", () => {
  const piece = { id: "A-9", team: "A" };
  const blocked = movementAuthorizationForPiece({ piece, team: "red", gameMode: "match", tracker: tracker() });
  assert.equal(blocked.mode, "blocked");
  assert.equal(blocked.reason, "wait-active-team");

  const freeState = tracker({ matchActionState: { freeMode: { active: true, pieceId: "A-9", team: "blue" } } });
  assert.equal(movementAuthorizationForPiece({ piece, team: "blue", gameMode: "match", tracker: freeState }).mode, "free");

  const normalState = tracker({ matchActionState: { byPieceId: { "A-9": { moveAuthorized: true } } } });
  assert.equal(movementAuthorizationForPiece({ piece, team: "blue", gameMode: "match", tracker: normalState }).mode, "normal");
});

test("free mode and permission rules are pure and reset state is fresh", () => {
  const started = toggleFreeModeState({}, { pieceId: "A-9", team: "blue", timelineGroupId: "free-1" });
  assert.equal(started.active, true);
  assert.equal(started.state.freeMode.pieceId, "A-9");
  const ended = toggleFreeModeState(started.state, { pieceId: "A-9", team: "blue", timelineGroupId: "free-1" });
  assert.equal(ended.active, false);

  assert.equal(canUseTrackerActionForPiece({
    piece: { id: "A-9", team: "A" },
    pieceTeam: "blue",
    myTeam: "red",
    sessionActive: true,
    gameMode: "match",
    gameStarted: true,
  }), false);

  const first = createEmptyTrackerTurnState();
  const second = createEmptyTrackerTurnState();
  first.actionLog.blue.push({ id: "x" });
  assert.equal(second.actionLog.blue.length, 0);
});
