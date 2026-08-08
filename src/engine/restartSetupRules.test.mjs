import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultRuleSet } from "../rules/ruleSets.mjs";
import {
  buildRestartSetup,
  setRestartWallPosition,
  setRestartWall,
  repositionRestartPiece,
  passRestartReposition,
  selectRestartExecutor,
  illegalDistanceDefenderIds,
  confirmRestartWallContinuation,
  declineRestartWallContinuation,
} from "./restartSetupRules.mjs";

const boardSettings = { cols: 20, rows: 12 };
const ruleSet = createDefaultRuleSet();

function piece(id, team, x, y) {
  return { id, team, x, y, cardId: `card-${id}` };
}

// Confirmed live with the user: the coach picks the wall's own position and
// length (a new "wall-position" phase) BEFORE picking which players fill
// it — this helper drives that first step so the rest of a test can focus
// on the player-selection step exactly like before the redesign.
function atWallPhase(restartSetup, { offset = 0, length = restartSetup.wallLength } = {}) {
  const result = setRestartWallPosition({ restartSetup, pieces: [] }, { boardSettings }, { payload: { offset, length } });
  assert.equal(result.accepted, true, `setRestartWallPosition should succeed: ${result.reason}`);
  return result.nextState.restartSetup;
}

test("a restart type with a configured wall starts at the wall-position phase, before any player selection", () => {
  const restartSetup = buildRestartSetup(ruleSet, "corner", "blue", { x: 19, y: 0 });
  assert.equal(restartSetup.phase, "wall-position");
  assert.equal(restartSetup.wallLength, restartSetup.wallSize, "length starts at the Rule Set's own configured max");
  assert.equal(restartSetup.wallOffset, 0);
  assert.equal(restartSetup.wallCells, null, "not yet fixed");
});

test("declining the wall entirely (No Wall) skips straight past player selection", () => {
  const restartSetup = buildRestartSetup(ruleSet, "corner", "blue", { x: 19, y: 0 });
  const result = setRestartWallPosition({ restartSetup, pieces: [] }, { boardSettings }, { payload: { noWall: true } });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.restartSetup.phase, "reposition");
  assert.deepEqual(result.nextState.restartSetup.wallCells, []);
  assert.equal(result.nextState.restartSetup.wallLength, 0);
});

test("setRestartWallPosition fixes a contiguous range of cells, centred on the ball's row and shifted by the coach's own offset", () => {
  const restartSetup = buildRestartSetup(ruleSet, "freeKickDirect", "blue", { x: 10, y: 6 });
  // Red defends the high-x goal, so its wall line sits toward increasing x.
  const centred = setRestartWallPosition({ restartSetup, pieces: [] }, { boardSettings }, { payload: { offset: 0, length: 2 } });
  assert.equal(centred.accepted, true);
  assert.deepEqual(centred.nextState.restartSetup.wallCells, [{ x: 15, y: 6 }, { x: 15, y: 7 }]);

  const shifted = setRestartWallPosition({ restartSetup, pieces: [] }, { boardSettings }, { payload: { offset: -2, length: 2 } });
  assert.equal(shifted.accepted, true);
  assert.deepEqual(shifted.nextState.restartSetup.wallCells, [{ x: 15, y: 4 }, { x: 15, y: 5 }]);
});

test("setRestartWallPosition clamps length to the Rule Set's configured maximum", () => {
  const restartSetup = buildRestartSetup(ruleSet, "corner", "blue", { x: 19, y: 0 }); // corner's own default wallSize is 1
  const result = setRestartWallPosition({ restartSetup, pieces: [] }, { boardSettings }, { payload: { offset: 0, length: 99 } });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.restartSetup.wallLength, restartSetup.wallSize);
});

test("setRestartWall places the selected defending-team pieces into the already-fixed wall cells", () => {
  const restartSetup = atWallPhase(buildRestartSetup(ruleSet, "freeKickDirect", "blue", { x: 10, y: 6 }), { offset: 0, length: 2 });
  const pieces = [piece("r1", "B", 2, 2), piece("r2", "B", 3, 3)];
  const state = { restartSetup, pieces };
  const result = setRestartWall(state, { boardSettings }, { payload: { pieceIds: ["r1", "r2"] } });
  assert.equal(result.accepted, true);
  const r1 = result.nextState.pieces.find(item => item.id === "r1");
  const r2 = result.nextState.pieces.find(item => item.id === "r2");
  assert.deepEqual({ x: r1.x, y: r1.y }, { x: 15, y: 6 });
  assert.deepEqual({ x: r2.x, y: r2.y }, { x: 15, y: 7 });
  assert.deepEqual(result.nextState.restartSetup.wallPieceIds, ["r1", "r2"]);
});

test("setRestartWall automatically, freely relocates a bystander already standing on a fixed wall cell", () => {
  const restartSetup = atWallPhase(buildRestartSetup(ruleSet, "freeKickDirect", "blue", { x: 10, y: 6 }), { offset: 0, length: 1 });
  const pieces = [piece("r1", "B", 2, 2), piece("bystander", "A", 15, 6)];
  const result = setRestartWall({ restartSetup, pieces }, { boardSettings }, { payload: { pieceIds: ["r1"] } });
  assert.equal(result.accepted, true);
  const r1 = result.nextState.pieces.find(item => item.id === "r1");
  const bystander = result.nextState.pieces.find(item => item.id === "bystander");
  assert.equal(r1.x, 15);
  assert.equal(r1.y, 6);
  // Bystander moves to the nearest free cell instead of being stacked under r1.
  assert.notEqual(`${bystander.x},${bystander.y}`, "15,6");
  assert.equal(Math.max(Math.abs(bystander.x - 15), Math.abs(bystander.y - 6)), 1);
});

test("setRestartWall rejects a player count that doesn't exactly match the fixed cell count, and an attacking-team piece", () => {
  const restartSetup = atWallPhase(buildRestartSetup(ruleSet, "corner", "blue", { x: 19, y: 0 }), { offset: 0, length: 1 });
  const pieces = [piece("r1", "B", 2, 2), piece("r2", "B", 3, 3), piece("b1", "A", 4, 4)];
  const tooMany = setRestartWall({ restartSetup, pieces }, { boardSettings }, { payload: { pieceIds: ["r1", "r2"] } });
  assert.equal(tooMany.accepted, false);
  assert.equal(tooMany.reason, "RESTART_WALL_PLAYER_COUNT_MISMATCH");
  const wrongTeam = setRestartWall({ restartSetup, pieces }, { boardSettings }, { payload: { pieceIds: ["b1"] } });
  assert.equal(wrongTeam.accepted, false);
  assert.equal(wrongTeam.reason, "RESTART_WALL_WRONG_TEAM");
});

test("Corner's single wall player stays on the ball's own column and moves along y toward the goal centre, 5 cells from the ball", () => {
  const restartSetup = atWallPhase(buildRestartSetup(ruleSet, "corner", "blue", { x: 19, y: 0 }), { offset: 0, length: 1 });
  const pieces = [piece("r1", "B", 2, 2)];
  const result = setRestartWall({ restartSetup, pieces }, { boardSettings }, { payload: { pieceIds: ["r1"] } });
  assert.equal(result.accepted, true);
  const r1 = result.nextState.pieces.find(item => item.id === "r1");
  assert.equal(r1.x, 19);
  assert.equal(r1.y, 5);
});

test("Corner's wall player moves the other way when the ball is at the bottom touchline corner", () => {
  const restartSetup = atWallPhase(buildRestartSetup(ruleSet, "corner", "red", { x: 0, y: 11 }), { offset: 0, length: 1 });
  const pieces = [piece("b1", "A", 2, 2)];
  const result = setRestartWall({ restartSetup, pieces }, { boardSettings }, { payload: { pieceIds: ["b1"] } });
  assert.equal(result.accepted, true);
  const b1 = result.nextState.pieces.find(item => item.id === "b1");
  assert.equal(b1.x, 0);
  assert.equal(b1.y, 6);
});

test("Goal Kick only: the non-executing team cannot reposition into the executing team's own box, but the executing team can", () => {
  const boxBoardSettings = { cols: 20, rows: 12, boxDepth: 6, boxWidth: 8, smallDepth: 3, smallWidth: 4 };
  let restartSetup = buildRestartSetup(ruleSet, "goalKick", "blue", { x: 1, y: 6 });
  restartSetup = { ...restartSetup, phase: "reposition", repositionTurn: "defense", repositionRemaining: { attack: 2, defense: 2 } };
  const pieces = [piece("r1", "B", 15, 5), piece("b1", "A", 15, 5)];
  const opponentAttempt = repositionRestartPiece({ restartSetup, pieces }, { boardSettings: boxBoardSettings }, { payload: { pieceId: "r1", x: 3, y: 5 } });
  assert.equal(opponentAttempt.accepted, false);
  assert.equal(opponentAttempt.reason, "RESTART_TARGET_INSIDE_EXECUTING_TEAM_BOX");

  const attackTurnSetup = { ...restartSetup, repositionTurn: "attack" };
  const ownTeamAttempt = repositionRestartPiece({ restartSetup: attackTurnSetup, pieces }, { boardSettings: boxBoardSettings }, { payload: { pieceId: "b1", x: 3, y: 5 } });
  assert.equal(ownTeamAttempt.accepted, true);
});

test("Corner has no box-repositioning restriction at all", () => {
  const boxBoardSettings = { cols: 20, rows: 12, boxDepth: 6, boxWidth: 8, smallDepth: 3, smallWidth: 4 };
  const restartSetup = { ...buildRestartSetup(ruleSet, "corner", "blue", { x: 19, y: 0 }), phase: "reposition", repositionTurn: "defense", repositionRemaining: { attack: 2, defense: 2 } };
  const pieces = [piece("r1", "B", 15, 5)];
  const result = repositionRestartPiece({ restartSetup, pieces }, { boardSettings: boxBoardSettings }, { payload: { pieceId: "r1", x: 3, y: 5 } });
  assert.equal(result.accepted, true);
});

test("Goal Kick: Skip is blocked for the non-executing side while it still has a player in the executing team's box", () => {
  const boxBoardSettings = { cols: 20, rows: 12, boxDepth: 6, boxWidth: 8, smallDepth: 3, smallWidth: 4 };
  const restartSetup = { ...buildRestartSetup(ruleSet, "goalKick", "blue", { x: 1, y: 6 }), phase: "reposition", repositionTurn: "defense", repositionRemaining: { attack: 2, defense: 2 } };
  const pieces = [piece("r1", "B", 3, 5)];
  const blocked = passRestartReposition({ restartSetup, pieces }, { boardSettings: boxBoardSettings }, {});
  assert.equal(blocked.accepted, false);
  assert.equal(blocked.reason, "RESTART_MUST_CLEAR_OWN_PLAYERS_FROM_BOX");
});

test("Goal Kick: once the box is clear, Skip works normally for the non-executing side", () => {
  const boxBoardSettings = { cols: 20, rows: 12, boxDepth: 6, boxWidth: 8, smallDepth: 3, smallWidth: 4 };
  const restartSetup = { ...buildRestartSetup(ruleSet, "goalKick", "blue", { x: 1, y: 6 }), phase: "reposition", repositionTurn: "defense", repositionRemaining: { attack: 2, defense: 2 } };
  const pieces = [piece("r1", "B", 15, 5)];
  const result = passRestartReposition({ restartSetup, pieces }, { boardSettings: boxBoardSettings }, {});
  assert.equal(result.accepted, true);
});

test("Goal Kick: the non-executing side must move a box occupant before touching any other of its own players", () => {
  const boxBoardSettings = { cols: 20, rows: 12, boxDepth: 6, boxWidth: 8, smallDepth: 3, smallWidth: 4 };
  const restartSetup = { ...buildRestartSetup(ruleSet, "goalKick", "blue", { x: 1, y: 6 }), phase: "reposition", repositionTurn: "defense", repositionRemaining: { attack: 2, defense: 2 } };
  const pieces = [piece("r1", "B", 3, 5), piece("r2", "B", 15, 5)];
  const state = { restartSetup, pieces };
  const context = { boardSettings: boxBoardSettings };
  const blockedOther = repositionRestartPiece(state, context, { payload: { pieceId: "r2", x: 16, y: 5 } });
  assert.equal(blockedOther.accepted, false);
  assert.equal(blockedOther.reason, "RESTART_MUST_REPOSITION_BOX_PLAYER_FIRST");
  const movesOccupant = repositionRestartPiece(state, context, { payload: { pieceId: "r1", x: 10, y: 5 } });
  assert.equal(movesOccupant.accepted, true);
});

test("Goal Kick: running out of moves with a player still in the box grants one more instead of finishing", () => {
  const boxBoardSettings = { cols: 20, rows: 12, boxDepth: 6, boxWidth: 8, smallDepth: 3, smallWidth: 4 };
  let restartSetup = { ...buildRestartSetup(ruleSet, "goalKick", "blue", { x: 1, y: 6 }), phase: "reposition", repositionTurn: "attack", repositionRemaining: { attack: 1, defense: 0 } };
  const pieces = [piece("b1", "A", 15, 5), piece("r1", "B", 3, 5)];
  const state = { restartSetup, pieces };
  const context = { boardSettings: boxBoardSettings };
  const result = repositionRestartPiece(state, context, { payload: { pieceId: "b1", x: 16, y: 5 } });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.restartSetup.phase, "reposition");
  assert.equal(result.nextState.restartSetup.repositionTurn, "defense");
  assert.equal(result.nextState.restartSetup.repositionRemaining.defense, 1);
  assert.equal(result.nextState.restartSetup.repositionRemaining.attack, 1, "attack gets a matching extra move too, same as Free Kick's illegal-distance case");
});

// Corner / Free Kick Direct / Free Kick Indirect: confirmed live with the
// user — a defending piece left standing closer to the ball than the legal
// minimum (5 orthogonal cells, 4 diagonal — the same distance the wall
// itself already uses) can otherwise permanently soft-lock the restart, so
// the defending side must clear it before touching any other of its own
// players, exactly like Goal Kick's own box rule.

test("illegalDistanceDefenderIds reads the same 5-orthogonal/4-diagonal boundary the wall itself uses", () => {
  const restartSetup = buildRestartSetup(ruleSet, "freeKickDirect", "blue", { x: 10, y: 6 });
  const pieces = [
    piece("on-ball", "B", 10, 6),
    piece("orthogonal-legal", "B", 15, 6), // dx:5, dy:0 — exactly legal
    piece("orthogonal-illegal", "B", 14, 6), // dx:4, dy:0 — one cell short
    piece("diagonal-legal", "B", 14, 10), // dx:4, dy:4 — exactly legal
    piece("diagonal-illegal", "B", 13, 9), // dx:3, dy:3 — one cell short
    piece("mixed-uses-stricter-5", "B", 14, 7), // dx:4, dy:1 — mixed offset, needs 5
    piece("attacker-never-restricted", "A", 10, 6), // on the ball, but attacking team
  ];
  const illegal = illegalDistanceDefenderIds({ pieces }, restartSetup);
  assert.deepEqual(illegal.sort(), ["mixed-uses-stricter-5", "on-ball", "orthogonal-illegal", "diagonal-illegal"].sort());
});

test("Corner also enforces the illegal-distance rule, unlike its own (absent) box rule", () => {
  const restartSetup = buildRestartSetup(ruleSet, "corner", "blue", { x: 19, y: 0 });
  const pieces = [piece("r1", "B", 18, 1)]; // dx:1, dy:1 — pure diagonal, well inside 4
  const illegal = illegalDistanceDefenderIds({ pieces }, restartSetup);
  assert.deepEqual(illegal, ["r1"]);
});

test("Free Kick: the defending side must move an illegal-distance player before touching any other of its own", () => {
  const restartSetup = { ...buildRestartSetup(ruleSet, "freeKickDirect", "blue", { x: 10, y: 6 }), phase: "reposition", repositionTurn: "defense", repositionRemaining: { attack: 2, defense: 2 } };
  const pieces = [piece("violator", "B", 10, 6), piece("other", "B", 0, 0)];
  const wrongPiece = repositionRestartPiece({ restartSetup, pieces }, { boardSettings }, { payload: { pieceId: "other", x: 1, y: 1 } });
  assert.equal(wrongPiece.accepted, false);
  assert.equal(wrongPiece.reason, "RESTART_MUST_REPOSITION_ILLEGAL_DISTANCE_PLAYER_FIRST");

  const movedViolator = repositionRestartPiece({ restartSetup, pieces }, { boardSettings }, { payload: { pieceId: "violator", x: 15, y: 6 } });
  assert.equal(movedViolator.accepted, true);
});

test("Free Kick: Skip is blocked for the defending side while an illegal-distance player remains, and works once cleared", () => {
  const restartSetup = { ...buildRestartSetup(ruleSet, "freeKickIndirect", "blue", { x: 10, y: 6 }), phase: "reposition", repositionTurn: "defense", repositionRemaining: { attack: 2, defense: 2 } };
  const pieces = [piece("violator", "B", 10, 6)];
  const blocked = passRestartReposition({ restartSetup, pieces }, { boardSettings }, {});
  assert.equal(blocked.accepted, false);
  assert.equal(blocked.reason, "RESTART_MUST_CLEAR_ILLEGAL_DISTANCE_PLAYERS_FIRST");

  const clearedPieces = [piece("violator", "B", 15, 6)];
  const allowed = passRestartReposition({ restartSetup, pieces: clearedPieces }, { boardSettings }, {});
  assert.equal(allowed.accepted, true);
});

test("Free Kick: repositioning a defender back INTO the illegal distance is rejected outright, not just flagged for later (reported live: this let the coach farm extra moves)", () => {
  const restartSetup = { ...buildRestartSetup(ruleSet, "freeKickDirect", "blue", { x: 10, y: 6 }), phase: "reposition", repositionTurn: "defense", repositionRemaining: { attack: 2, defense: 1 } };
  const pieces = [piece("violator", "B", 10, 6), piece("other", "B", 0, 0)];
  // (8,6): dx:2, dy:0, chebyshev 2 — still within the illegal 5-cell band.
  const result = repositionRestartPiece({ restartSetup, pieces }, { boardSettings }, { payload: { pieceId: "violator", x: 8, y: 6 } });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "RESTART_TARGET_WITHIN_ILLEGAL_DISTANCE");
});

test("Free Kick: running out of moves with a SECOND violator still within the illegal distance grants one more instead of finishing", () => {
  const restartSetup = { ...buildRestartSetup(ruleSet, "freeKickDirect", "blue", { x: 10, y: 6 }), phase: "reposition", repositionTurn: "defense", repositionRemaining: { attack: 2, defense: 1 } };
  const pieces = [piece("violator1", "B", 10, 6), piece("violator2", "B", 9, 6), piece("other", "B", 0, 0)];
  const result = repositionRestartPiece({ restartSetup, pieces }, { boardSettings }, { payload: { pieceId: "violator1", x: 15, y: 6 } });
  assert.equal(result.accepted, true);
  // violator2 is still illegal (dx:1) — the defending side is granted
  // another move rather than being allowed to finish with it still there.
  assert.equal(result.nextState.restartSetup.phase, "reposition");
  assert.equal(result.nextState.restartSetup.repositionTurn, "defense");
  assert.equal(result.nextState.restartSetup.repositionRemaining.defense, 1);
  // Confirmed live with the user: any extra move granted to defense (here,
  // this lazy mid-phase top-up, not just the upfront grant) is matched with
  // an equal extra move for attack.
  assert.equal(result.nextState.restartSetup.repositionRemaining.attack, 3, "attack gets a matching extra move too");
});

test("Free Kick: a defense move that actually clears the LAST violator on the LAST remaining defense move advances normally — reported live: it wrongly re-granted moves and forced the turn back to defense instead", () => {
  const restartSetup = { ...buildRestartSetup(ruleSet, "freeKickDirect", "blue", { x: 10, y: 6 }), phase: "reposition", repositionTurn: "defense", repositionRemaining: { attack: 0, defense: 1 } };
  const pieces = [piece("violator", "B", 10, 6)];
  // (15,6): dx:5, chebyshev 5 — legal, clears the only violator.
  const result = repositionRestartPiece({ restartSetup, pieces }, { boardSettings }, { payload: { pieceId: "violator", x: 15, y: 6 } });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.restartSetup.phase, "executor", "both sides genuinely exhausted, no violator left — must not be re-granted a phantom extra move");
  assert.deepEqual(result.nextState.restartSetup.repositionRemaining, { attack: 0, defense: 0 });
});

function repositionSetupWithWall() {
  // freeKickDirect, blue attacking (defends toward high x), ball at (10,6):
  // wallX = 10 + 5 = 15, a single wall cell at (15,6) once confirmed.
  const built = buildRestartSetup(ruleSet, "freeKickDirect", "blue", { x: 10, y: 6 });
  const positioned = setRestartWallPosition({ restartSetup: built, pieces: [] }, { boardSettings }, { payload: { offset: 0, length: 1 } });
  assert.deepEqual(positioned.nextState.restartSetup.wallCells, [{ x: 15, y: 6 }]);
  return { ...positioned.nextState.restartSetup, phase: "reposition", repositionTurn: "defense", repositionRemaining: { attack: 2, defense: 2 } };
}

test("a defense reposition extending the wall's own line opens a Yes/No gate instead of moving immediately", () => {
  const restartSetup = repositionSetupWithWall();
  const pieces = [piece("r1", "B", 0, 0)];
  const result = repositionRestartPiece({ restartSetup, pieces }, { boardSettings }, { payload: { pieceId: "r1", x: 15, y: 7 } });
  assert.equal(result.accepted, true);
  assert.deepEqual(result.nextState.pendingRestartWallContinuation, { pieceId: "r1", x: 15, y: 7, side: "defense", team: "red" });
  // Nothing committed yet — piece unmoved, move not consumed, phase untouched.
  assert.equal(result.nextState.pieces.find(item => item.id === "r1").x, 0);
  assert.equal(result.nextState.restartSetup, restartSetup);
});

test("confirming the wall-continuation gate actually performs the reposition", () => {
  const restartSetup = repositionSetupWithWall();
  const pieces = [piece("r1", "B", 0, 0)];
  const opened = repositionRestartPiece({ restartSetup, pieces }, { boardSettings }, { payload: { pieceId: "r1", x: 15, y: 7 } });
  const confirmed = confirmRestartWallContinuation(opened.nextState, { boardSettings }, {});
  assert.equal(confirmed.accepted, true);
  assert.equal(confirmed.nextState.pendingRestartWallContinuation, null);
  const moved = confirmed.nextState.pieces.find(item => item.id === "r1");
  assert.equal(moved.x, 15); assert.equal(moved.y, 7);
  assert.equal(confirmed.nextState.restartSetup.repositionRemaining.defense, 1, "the move is actually consumed on confirm");
});

test("declining the wall-continuation gate leaves the piece exactly where it was, no move consumed", () => {
  const restartSetup = repositionSetupWithWall();
  const pieces = [piece("r1", "B", 0, 0)];
  const opened = repositionRestartPiece({ restartSetup, pieces }, { boardSettings }, { payload: { pieceId: "r1", x: 15, y: 7 } });
  const declined = declineRestartWallContinuation(opened.nextState, { boardSettings }, {});
  assert.equal(declined.accepted, true);
  assert.equal(declined.nextState.pendingRestartWallContinuation, null);
  assert.equal(declined.nextState.pieces.find(item => item.id === "r1").x, 0, "piece stays put");
  assert.equal(declined.nextState.restartSetup.repositionRemaining.defense, 2, "no move consumed");
});

test("an ordinary defense reposition off the wall's line commits immediately, no gate", () => {
  const restartSetup = repositionSetupWithWall();
  const pieces = [piece("r1", "B", 0, 0)];
  const result = repositionRestartPiece({ restartSetup, pieces }, { boardSettings }, { payload: { pieceId: "r1", x: 3, y: 3 } });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.pendingRestartWallContinuation ?? null, null);
  assert.equal(result.nextState.pieces.find(item => item.id === "r1").x, 3);
});

test("an attack reposition onto the wall-continuation cell is never gated — only defense extends a wall", () => {
  const restartSetup = { ...repositionSetupWithWall(), repositionTurn: "attack" };
  const pieces = [piece("b1", "A", 0, 0)];
  const result = repositionRestartPiece({ restartSetup, pieces }, { boardSettings }, { payload: { pieceId: "b1", x: 15, y: 7 } });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.pendingRestartWallContinuation ?? null, null);
  assert.equal(result.nextState.pieces.find(item => item.id === "b1").x, 15);
});

test("entering reposition grants both sides the same extra moves upfront when illegal-distance defenders outnumber repositionCount", () => {
  const wallLessRuleSet = { ...ruleSet, actions: { ...ruleSet.actions, restarts: { ...ruleSet.actions.restarts, freeKickDirect: { ...ruleSet.actions.restarts.freeKickDirect, wallSize: 0, repositionCount: 1 } } } };
  const restartSetup = buildRestartSetup(wallLessRuleSet, "freeKickDirect", "blue", { x: 10, y: 6 });
  assert.equal(restartSetup.phase, "reposition", "no wall configured — starts directly in reposition");
  // Three defenders sit within the illegal distance (5 orthogonal), one more
  // than the configured repositionCount of 1 — both sides should already
  // have 1 + 2 = 3 moves from the very start, attack included, since attack
  // moves first and cannot be topped up retroactively after the fact.
  const pieces = [piece("d1", "B", 10, 7), piece("d2", "B", 11, 6), piece("d3", "B", 9, 6)];
  const withPieces = buildRestartSetup(wallLessRuleSet, "freeKickDirect", "blue", { x: 10, y: 6 }, pieces, boardSettings);
  assert.deepEqual(withPieces.repositionRemaining, { attack: 3, defense: 3 });
});

test("declining the wall (No Wall) also grants the upfront symmetric extra when illegal-distance defenders outnumber repositionCount", () => {
  const restartSetup = { ...buildRestartSetup(ruleSet, "corner", "blue", { x: 19, y: 0 }), repositionCount: 1, wallSize: 1 };
  // Both within the illegal 5-cell (orthogonal-ish) distance of ballCell
  // (19,0): d1 chebyshev 4, d2 chebyshev 4 — neither is a pure diagonal
  // (dx !== dy), so both use the stricter 5-cell threshold.
  const pieces = [piece("d1", "B", 19, 4), piece("d2", "B", 18, 4)];
  const result = setRestartWallPosition({ restartSetup, pieces }, { boardSettings }, { payload: { noWall: true } });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.restartSetup.phase, "reposition");
  assert.deepEqual(result.nextState.restartSetup.repositionRemaining, { attack: 2, defense: 2 });
});

test("throw-in restart setup skips wall and reposition entirely (both configured 0)", () => {
  const restartSetup = buildRestartSetup(ruleSet, "throwIn", "blue", { x: 5, y: 0 });
  assert.equal(restartSetup.phase, "executor");
  assert.equal(restartSetup.wallSize, 0);
  assert.equal(restartSetup.repositionCount, 0);
});

test("reposition alternates attack first, then moves to executor once both sides are exhausted", () => {
  let restartSetup = buildRestartSetup(ruleSet, "goalKick", "blue", { x: 1, y: 6 });
  restartSetup = { ...restartSetup, phase: "reposition", repositionRemaining: { attack: 2, defense: 2 } };
  const pieces = [piece("b1", "A", 3, 3), piece("r1", "B", 4, 4)];
  let state = { restartSetup, pieces };
  const context = { boardSettings };

  let result = repositionRestartPiece(state, context, { payload: { pieceId: "b1", x: 10, y: 5 } });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.restartSetup.repositionTurn, "defense");
  assert.equal(result.nextState.restartSetup.repositionRemaining.attack, 1);
  state = result.nextState;

  result = repositionRestartPiece(state, context, { payload: { pieceId: "r1", x: 11, y: 5 } });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.restartSetup.repositionTurn, "attack");
  state = result.nextState;

  result = passRestartReposition(state, context, {});
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.restartSetup.repositionTurn, "defense");
  state = result.nextState;

  result = passRestartReposition(state, context, {});
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.restartSetup.phase, "executor");
});

test("reposition rejects the wrong team's piece", () => {
  const restartSetup = { ...buildRestartSetup(ruleSet, "goalKick", "blue", { x: 1, y: 6 }), phase: "reposition" };
  const pieces = [piece("r1", "B", 4, 4)];
  const result = repositionRestartPiece({ restartSetup, pieces }, { boardSettings }, { payload: { pieceId: "r1", x: 10, y: 5 } });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "RESTART_REPOSITION_WRONG_TEAM");
});

test("every restart type reaches the executor phase (never execution) once wall and reposition are done", () => {
  let restartSetup = buildRestartSetup(ruleSet, "corner", "blue", { x: 19, y: 0 });
  // repositionCount (not just repositionRemaining) needs overriding — the
  // wall-position "no wall" transition now recomputes repositionRemaining
  // fresh from repositionCount (plus any illegal-distance extra, zero here
  // since pieces is empty) every time it enters "reposition".
  restartSetup = { ...restartSetup, repositionCount: 1 };
  const state = { restartSetup, pieces: [] };
  const context = { boardSettings };
  let result = setRestartWallPosition(state, context, { payload: { noWall: true } });
  assert.equal(result.nextState.restartSetup.phase, "reposition");
  let s2 = result.nextState;
  result = passRestartReposition(s2, context, {});
  s2 = result.nextState;
  result = passRestartReposition(s2, context, {});
  s2 = result.nextState;
  assert.equal(s2.restartSetup.phase, "executor");
});

test("skipping a reposition turn only skips that one move, not the rest of that side's turns", () => {
  const restartSetup = { ...buildRestartSetup(ruleSet, "corner", "blue", { x: 19, y: 0 }), phase: "reposition", repositionRemaining: { attack: 2, defense: 2 } };
  const state = { restartSetup, pieces: [] };
  const context = { boardSettings };
  let result = passRestartReposition(state, context, {});
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.restartSetup.repositionRemaining.attack, 1);
  assert.equal(result.nextState.restartSetup.repositionTurn, "defense");
});

test("the ball cell is fixed before setup starts and is never chosen at the executor step — only the piece is", () => {
  let restartSetup = { ...buildRestartSetup(ruleSet, "goalKick", "blue", { x: 1, y: 6 }), phase: "executor" };
  const pieces = [piece("b1", "A", 3, 3)];
  const result = selectRestartExecutor({ restartSetup, pieces }, { boardSettings }, { payload: { pieceId: "b1" } });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.restartSetup.phase, "execution");
  assert.equal(result.nextState.restartSetup.executorId, "b1");
  assert.deepEqual(result.nextState.restartSetup.ballCell, { x: 1, y: 6 });
  const movedPiece = result.nextState.pieces.find(item => item.id === "b1");
  assert.equal(movedPiece.x, 1);
  assert.equal(movedPiece.y, 6);
});

test("selectRestartExecutor automatically, freely relocates a bystander already standing on the ball cell", () => {
  const restartSetup = { ...buildRestartSetup(ruleSet, "goalKick", "blue", { x: 5, y: 5 }), phase: "executor" };
  const pieces = [piece("b1", "A", 10, 10), piece("bystander", "B", 5, 5)];
  const result = selectRestartExecutor({ restartSetup, pieces }, { boardSettings }, { payload: { pieceId: "b1" } });
  assert.equal(result.accepted, true);
  const executor = result.nextState.pieces.find(item => item.id === "b1");
  const bystander = result.nextState.pieces.find(item => item.id === "bystander");
  assert.deepEqual({ x: executor.x, y: executor.y }, { x: 5, y: 5 });
  assert.notEqual(`${bystander.x},${bystander.y}`, "5,5");
  assert.equal(Math.max(Math.abs(bystander.x - 5), Math.abs(bystander.y - 5)), 1);
});

test("goal kick executor selection rejects a piece from the wrong team", () => {
  const restartSetup = { ...buildRestartSetup(ruleSet, "goalKick", "blue", { x: 1, y: 6 }), phase: "executor" };
  const pieces = [piece("r1", "B", 3, 3)];
  const result = selectRestartExecutor({ restartSetup, pieces }, { boardSettings }, { payload: { pieceId: "r1" } });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "RESTART_EXECUTOR_WRONG_TEAM");
});

test("corner (also a fixed-cell type) uses the same explicit RESTART_EXECUTOR_SELECTED command", () => {
  const restartSetup = { ...buildRestartSetup(ruleSet, "corner", "blue", { x: 19, y: 0 }), phase: "executor" };
  const pieces = [piece("b1", "A", 3, 3)];
  const result = selectRestartExecutor({ restartSetup, pieces }, { boardSettings }, { payload: { pieceId: "b1" } });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.restartSetup.executorId, "b1");
  assert.deepEqual(result.nextState.restartSetup.ballCell, { x: 19, y: 0 });
});
