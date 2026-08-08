import assert from "node:assert/strict";
import test from "node:test";
import { selectSinglePlayerRestartSetupPresentation, selectSinglePlayerPieceActionPresentation, selectSinglePlayerWallPositionPreview, selectSinglePlayerRestartRepositionCellPreview } from "./matchPresentationSelectors.mjs";
import { buildRestartSetup, setRestartWallPosition } from "./restartSetupRules.mjs";
import { createDefaultRuleSet } from "../rules/ruleSets.mjs";

const ruleSet = createDefaultRuleSet();

function piece(id, team) {
  return { id, team, cardId: `card-${id}` };
}

test("selectSinglePlayerRestartSetupPresentation is inactive with no restartSetup", () => {
  assert.deepEqual(selectSinglePlayerRestartSetupPresentation({}), { active: false });
});

test("wall-position phase precedes player selection, with no eligible pieces exposed yet", () => {
  const restartSetup = buildRestartSetup(ruleSet, "corner", "blue", { x: 19, y: 0 });
  const state = { restartSetup, pieces: [piece("b1", "A"), piece("r1", "B"), piece("r2", "B")] };
  const presentation = selectSinglePlayerRestartSetupPresentation(state);
  assert.equal(presentation.active, true);
  assert.equal(presentation.phase, "wall-position");
  assert.equal(presentation.defenseTeam, "red");
  assert.deepEqual(presentation.wallEligiblePieceIds, [], "no player selection yet — position/length come first");
  assert.deepEqual(presentation.executorEligiblePieceIds, []);
});

test("selectSinglePlayerWallPositionPreview previews a draft offset/length using the Engine's own wallRangeCells, without touching state", () => {
  const restartSetup = buildRestartSetup(ruleSet, "freeKickDirect", "blue", { x: 10, y: 6 });
  const state = { restartSetup, settings: { cols: 20, rows: 12 }, pieces: [] };
  const preview = selectSinglePlayerWallPositionPreview(state, { offset: -1, length: 3 });
  assert.equal(preview.active, true);
  assert.equal(preview.maxLength, restartSetup.wallSize);
  // Red defends the high-x goal: wallX = 10 + 5 = 15. centreY = 6 + offset(-1)
  // = 5, length 3 → startY = 5 - 1 = 4.
  assert.deepEqual(preview.cells, [{ x: 15, y: 4 }, { x: 15, y: 5 }, { x: 15, y: 6 }]);
  // Untouched — this is a pure preview, no dispatch.
  assert.equal(state.restartSetup.wallCells, null);
});

test("selectSinglePlayerWallPositionPreview clamps a draft length to the configured maximum and is inactive outside the wall-position phase", () => {
  const restartSetup = buildRestartSetup(ruleSet, "corner", "blue", { x: 19, y: 0 }); // wallSize defaults to 1
  const preview = selectSinglePlayerWallPositionPreview({ restartSetup, settings: { cols: 20, rows: 12 } }, { offset: 0, length: 5 });
  assert.equal(preview.length, 1);
  const wrongPhase = selectSinglePlayerWallPositionPreview({ restartSetup: { ...restartSetup, phase: "wall" }, settings: {} }, { offset: 0, length: 1 });
  assert.deepEqual(wrongPhase, { active: false });
});

test("wall phase (after position/length is confirmed) exposes only the defending team's eligible pieces", () => {
  const boardSettings = { cols: 20, rows: 12 };
  const positioned = setRestartWallPosition(
    { restartSetup: buildRestartSetup(ruleSet, "corner", "blue", { x: 19, y: 0 }), pieces: [] },
    { boardSettings },
    { payload: { offset: 0, length: 1 } },
  );
  const state = { restartSetup: positioned.nextState.restartSetup, pieces: [piece("b1", "A"), piece("r1", "B"), piece("r2", "B")] };
  const presentation = selectSinglePlayerRestartSetupPresentation(state);
  assert.equal(presentation.phase, "wall");
  assert.deepEqual(presentation.wallEligiblePieceIds.sort(), ["r1", "r2"]);
  assert.deepEqual(presentation.executorEligiblePieceIds, []);
});

test("wall phase's own wallLength reflects the coach's CHOSEN length for this restart, not the Rule Set's configured maximum (reported live: the player-count screen showed the Rules max instead)", () => {
  const boardSettings = { cols: 20, rows: 12 };
  const restartSetup = buildRestartSetup(ruleSet, "freeKickDirect", "blue", { x: 10, y: 6 });
  assert.equal(restartSetup.wallSize, 4, "sanity check on the default Rule Set's own configured maximum");
  const positioned = setRestartWallPosition({ restartSetup, pieces: [] }, { boardSettings }, { payload: { offset: 0, length: 2 } });
  const state = { restartSetup: positioned.nextState.restartSetup, pieces: [] };
  const presentation = selectSinglePlayerRestartSetupPresentation(state);
  assert.equal(presentation.phase, "wall");
  assert.equal(presentation.wallLength, 2, "the chosen length for THIS wall, not the Rules maximum of 4");
});

test("reposition phase reports whose turn by team name and remaining counts by team", () => {
  const restartSetup = { ...buildRestartSetup(ruleSet, "goalKick", "blue", { x: 1, y: 6 }), phase: "reposition", repositionTurn: "defense" };
  const state = { restartSetup, pieces: [piece("b1", "A"), piece("r1", "B")] };
  const presentation = selectSinglePlayerRestartSetupPresentation(state);
  assert.equal(presentation.repositionTurnTeam, "red");
  assert.deepEqual(presentation.repositionEligiblePieceIds, ["r1"]);
  assert.equal(presentation.repositionRemaining.blue, restartSetup.repositionRemaining.attack);
  assert.equal(presentation.repositionRemaining.red, restartSetup.repositionRemaining.defense);
});

test("selectSinglePlayerRestartRepositionCellPreview mirrors repositionRestartPiece's own legality — legal for a free cell, illegal for an occupied one, and without a staged piece at all", () => {
  const boardSettings = { cols: 20, rows: 12 };
  const restartSetup = { ...buildRestartSetup(ruleSet, "goalKick", "blue", { x: 1, y: 6 }), phase: "reposition", repositionTurn: "defense" };
  const state = { restartSetup, pieces: [{ id: "b1", team: "A", x: 5, y: 5, cardId: "card-b1" }, { id: "r1", team: "B", x: 10, y: 10, cardId: "card-r1" }] };
  const context = { boardSettings };
  assert.equal(selectSinglePlayerRestartRepositionCellPreview(state, context, { pieceId: "r1", x: 3, y: 3 }).legal, true);
  assert.equal(selectSinglePlayerRestartRepositionCellPreview(state, context, { pieceId: "r1", x: 5, y: 5 }).legal, false, "occupied by b1");
  assert.equal(selectSinglePlayerRestartRepositionCellPreview(state, context, { x: 3, y: 3 }).legal, false, "no pieceId staged yet");
});

test("Goal Kick: while the non-executing side has a box occupant, only that occupant is eligible and Skip must be flagged blocked", () => {
  const boxSettings = { cols: 20, rows: 12, boxDepth: 6, boxWidth: 8, smallDepth: 3, smallWidth: 4 };
  const restartSetup = { ...buildRestartSetup(ruleSet, "goalKick", "blue", { x: 1, y: 6 }), phase: "reposition", repositionTurn: "defense" };
  const state = {
    restartSetup,
    settings: boxSettings,
    pieces: [
      { id: "r1", team: "B", x: 3, y: 5, cardId: "card-r1" },
      { id: "r2", team: "B", x: 15, y: 5, cardId: "card-r2" },
    ],
  };
  const presentation = selectSinglePlayerRestartSetupPresentation(state);
  assert.deepEqual(presentation.repositionEligiblePieceIds, ["r1"]);
  assert.equal(presentation.repositionMustClearBoxFirst, true);
});

test("Free Kick: while the defending side has a player within the illegal ball distance, only that player is eligible and Skip must be flagged blocked", () => {
  const restartSetup = { ...buildRestartSetup(ruleSet, "freeKickDirect", "blue", { x: 10, y: 6 }), phase: "reposition", repositionTurn: "defense" };
  const state = {
    restartSetup,
    pieces: [
      { id: "r1", team: "B", x: 10, y: 6, cardId: "card-r1" }, // on the ball — illegal
      { id: "r2", team: "B", x: 15, y: 6, cardId: "card-r2" }, // exactly 5 orthogonal — legal
    ],
  };
  const presentation = selectSinglePlayerRestartSetupPresentation(state);
  assert.deepEqual(presentation.repositionEligiblePieceIds, ["r1"]);
  assert.equal(presentation.repositionMustClearBoxFirst, false, "Free Kick has no box rule");
  assert.equal(presentation.repositionMustClearIllegalDistanceFirst, true);
});

test("Goal Kick: once the box is clear, every eligible piece of the side's own team is selectable again", () => {
  const boxSettings = { cols: 20, rows: 12, boxDepth: 6, boxWidth: 8, smallDepth: 3, smallWidth: 4 };
  const restartSetup = { ...buildRestartSetup(ruleSet, "goalKick", "blue", { x: 1, y: 6 }), phase: "reposition", repositionTurn: "defense" };
  const state = {
    restartSetup,
    settings: boxSettings,
    pieces: [
      { id: "r1", team: "B", x: 15, y: 5, cardId: "card-r1" },
      { id: "r2", team: "B", x: 16, y: 5, cardId: "card-r2" },
    ],
  };
  const presentation = selectSinglePlayerRestartSetupPresentation(state);
  assert.deepEqual(presentation.repositionEligiblePieceIds.sort(), ["r1", "r2"]);
  assert.equal(presentation.repositionMustClearBoxFirst, false);
});

test("executor phase exposes only the attacking team's eligible pieces", () => {
  const restartSetup = { ...buildRestartSetup(ruleSet, "corner", "blue", { x: 19, y: 0 }), phase: "executor" };
  const state = { restartSetup, pieces: [piece("b1", "A"), piece("b2", "A"), piece("r1", "B")] };
  const presentation = selectSinglePlayerRestartSetupPresentation(state);
  assert.deepEqual(presentation.executorEligiblePieceIds.sort(), ["b1", "b2"]);
});

test("every piece's action buttons are blocked while restart setup is not in the execution phase", () => {
  const restartSetup = buildRestartSetup(ruleSet, "corner", "blue", { x: 19, y: 0 });
  const state = { restartSetup, pieces: [], tracker: { gameStarted: true, currentTurn: 1 } };
  const p = piece("b1", "A");
  const presentation = selectSinglePlayerPieceActionPresentation(state, { piece: p });
  assert.equal(presentation.actionAllowed, false);
  assert.equal(presentation.movementAuthorization.reason, "restart-setup-active");
});

test("during execution only the entitled executor's action buttons are unblocked", () => {
  const restartSetup = { ...buildRestartSetup(ruleSet, "corner", "blue", { x: 19, y: 0 }), phase: "execution", executorId: "b1" };
  const state = { restartSetup, pieces: [], gameMode: "match", tracker: { gameStarted: true, currentTurn: 1, usedActions: { blue: 0, red: 0 }, personalActionsByPieceId: {}, matchActionState: {}, settings: { attackActions: 5, defenseActions: 4, turns: 20 } } };
  const executor = piece("b1", "A");
  const other = piece("b2", "A");
  assert.equal(selectSinglePlayerPieceActionPresentation(state, { piece: other }).movementAuthorization.reason, "restart-setup-active");
  assert.notEqual(selectSinglePlayerPieceActionPresentation(state, { piece: executor }).movementAuthorization.reason, "restart-setup-active");
});
