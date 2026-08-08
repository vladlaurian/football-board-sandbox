import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../game/gameState.mjs";
import { applyGameCommand } from "./gameEngine.mjs";
import { createMatchContext } from "./matchContext.mjs";
import { formationById } from "../board/standardFormations.mjs";
import { formationAdjustCells, formationAdjustAnchor } from "../prep/adjustZones.mjs";

const BOARD_SETTINGS = { cols: 44, rows: 29, invisiblePadding: 2, goalWidth: 5 };

function adjustState(overrides = {}) {
  return createGameState({
    gameMode: "match",
    pieces: [
      { id: "ball", team: "BALL", x: 22, y: 14 },
      { id: "A-0", team: "A", cardId: "card-a0", x: 1, y: 1 },
      { id: "A-1", team: "A", cardId: "card-a1", x: 2, y: 2 },
    ],
    activeFormation: { blue: 1, red: null },
    tracker: {
      gameStarted: true, startingTeam: "blue", currentTurn: 3,
      usedActions: { blue: 0, red: 0 }, actionLog: { blue: [], red: [] }, matchActionState: {}, turnPhase: "attack",
      settings: { attackActions: 5, defenseActions: 4, turns: 20 },
    },
    ...overrides,
  });
}

function adjustContext() {
  return createMatchContext({ id: "adjust-context", boardSettings: BOARD_SETTINGS, gameplayCards: [] });
}

test("ADJUST_PIECE_PLACED is rejected away from a kickoff moment", () => {
  const result = applyGameCommand({
    state: adjustState(), context: adjustContext(),
    command: { id: "adjust-1", type: "ADJUST_PIECE_PLACED", payload: { pieceId: "A-0", x: 5, y: 5 } },
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "ADJUST_NOT_AT_KICKOFF");
});

test("ADJUST_PIECE_PLACED moves a non-kickoff piece within its formation-anchored range during a post-goal kickoff", () => {
  const state = adjustState({ kickoffRestart: { team: "blue", pieceId: "A-0" } });
  const anchor = formationAdjustAnchor({ id: "A-1", team: "A" }, formationById(1), BOARD_SETTINGS.cols);
  const target = { x: anchor.x, y: anchor.y };
  const result = applyGameCommand({
    state, context: adjustContext(),
    command: { id: "adjust-2", type: "ADJUST_PIECE_PLACED", payload: { pieceId: "A-1", x: target.x, y: target.y } },
  });
  assert.equal(result.accepted, true);
  const piece = result.nextState.pieces.find(p => p.id === "A-1");
  assert.equal(piece.x, target.x);
  assert.equal(piece.y, target.y);
});

test("ADJUST_PIECE_PLACED rejects adjusting the entitled kick-off piece itself while its restart is pending", () => {
  const state = adjustState({ kickoffRestart: { team: "blue", pieceId: "A-0" } });
  const anchor = formationAdjustAnchor({ id: "A-0", team: "A" }, formationById(1), BOARD_SETTINGS.cols);
  const result = applyGameCommand({
    state, context: adjustContext(),
    command: { id: "adjust-2b", type: "ADJUST_PIECE_PLACED", payload: { pieceId: "A-0", x: anchor.x, y: anchor.y } },
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "ADJUST_PIECE_IS_KICKOFF_TAKER");
});

test("ADJUST_PIECE_PLACED rejects a target outside the formation-anchored range", () => {
  const state = adjustState({ tracker: { ...adjustState().tracker, gameStarted: false, currentTurn: 0 } });
  const result = applyGameCommand({
    state, context: adjustContext(),
    command: { id: "adjust-3", type: "ADJUST_PIECE_PLACED", payload: { pieceId: "A-0", x: 40, y: 28 } },
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "ADJUST_OUTSIDE_FORMATION_RANGE");
});

test("ADJUST_PIECE_PLACED rejects a bench reserve", () => {
  const state = adjustState({
    pieces: [{ id: "ball", team: "BALL", x: 22, y: 14 }, { id: "A-R-1", team: "A", cardId: "card-reserve", x: -2, y: 5 }],
    tracker: { ...adjustState().tracker, gameStarted: false, currentTurn: 0 },
  });
  const result = applyGameCommand({
    state, context: adjustContext(),
    command: { id: "adjust-4", type: "ADJUST_PIECE_PLACED", payload: { pieceId: "A-R-1", x: 1, y: 1 } },
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "ADJUST_PIECE_INVALID");
});

test("FORMATION_TACTIC_CONFIRMED records activeFormation when it applies immediately", () => {
  const state = adjustState({ tracker: { ...adjustState().tracker, gameStarted: false, currentTurn: 0 } });
  const result = applyGameCommand({
    state, context: adjustContext(),
    command: { id: "confirm-active", type: "FORMATION_TACTIC_CONFIRMED", payload: { team: "blue", formationId: 3 } },
  });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.activeFormation.blue, 3);
});
