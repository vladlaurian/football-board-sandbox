import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../game/gameState.mjs";
import { applyGameCommand } from "./gameEngine.mjs";
import { createMatchContext } from "./matchContext.mjs";
import { formationById } from "../board/standardFormations.mjs";
import { formationStarterCoordinates } from "../board/formationLayout.mjs";

const BOARD_SETTINGS = { cols: 44, rows: 29, invisiblePadding: 2, goalWidth: 5 };

function blueStarterPieces() {
  return formationById(1).players.map((_, index) => ({ id: `A-${index}`, team: "A", cardId: `card-blue-${index}`, x: 0, y: 0 }));
}

function tacticState(overrides = {}) {
  return createGameState({
    gameMode: "match",
    pieces: [{ id: "ball", team: "BALL", x: 22, y: 14 }, ...blueStarterPieces()],
    tracker: {
      gameStarted: true,
      startingTeam: "blue",
      currentTurn: 3,
      usedActions: { blue: 0, red: 0 },
      actionLog: { blue: [], red: [] },
      matchActionState: {},
      turnPhase: "attack",
      settings: { attackActions: 5, defenseActions: 4, turns: 20 },
    },
    ...overrides,
  });
}

function tacticContext() {
  return createMatchContext({ id: "tactic-context", boardSettings: BOARD_SETTINGS, gameplayCards: [] });
}

test("FORMATION_TACTIC_CONFIRMED applies immediately before the Match has started (kickoff moment)", () => {
  const state = tacticState({ tracker: { gameStarted: false, currentTurn: 0, startingTeam: "blue", usedActions: { blue: 0, red: 0 }, actionLog: { blue: [], red: [] }, matchActionState: {}, turnPhase: "attack", settings: { attackActions: 5, defenseActions: 4, turns: 20 } } });
  const result = applyGameCommand({
    state, context: tacticContext(),
    command: { id: "confirm-1", type: "FORMATION_TACTIC_CONFIRMED", payload: { team: "blue", formationId: 2 } },
  });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.pendingFormation.blue, null);
  const expected = formationStarterCoordinates("A", formationById(2), BOARD_SETTINGS);
  for (const coord of expected) {
    const piece = result.nextState.pieces.find(p => p.id === coord.id);
    assert.equal(piece.x, coord.x);
    assert.equal(piece.y, coord.y);
  }
});

test("FORMATION_TACTIC_CONFIRMED queues pendingFormation mid-Match, away from any kickoff moment", () => {
  const state = tacticState();
  const before = state.pieces.find(p => p.id === "A-0");
  const result = applyGameCommand({
    state, context: tacticContext(),
    command: { id: "confirm-2", type: "FORMATION_TACTIC_CONFIRMED", payload: { team: "blue", formationId: 2 } },
  });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.pendingFormation.blue, 2);
  const after = result.nextState.pieces.find(p => p.id === "A-0");
  assert.equal(after.x, before.x);
  assert.equal(after.y, before.y);
});

test("FORMATION_TACTIC_CONFIRMED applies immediately during a pending post-goal kickoffRestart, but never moves the ball or the kick-off piece off centre", () => {
  const state = tacticState({ kickoffRestart: { team: "blue", pieceId: "A-0" } });
  const result = applyGameCommand({
    state, context: tacticContext(),
    command: { id: "confirm-3", type: "FORMATION_TACTIC_CONFIRMED", payload: { team: "blue", formationId: 2 } },
  });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.pendingFormation.blue, null);
  // A-3 is an ordinary slot: it follows the new formation exactly.
  const expected = formationStarterCoordinates("A", formationById(2), BOARD_SETTINGS);
  const expectedSlot = expected.find(coord => coord.id === "A-3");
  const otherPiece = result.nextState.pieces.find(p => p.id === "A-3");
  assert.equal(otherPiece.x, expectedSlot.x);
  assert.equal(otherPiece.y, expectedSlot.y);
  // A-0 is the kick-off piece: it and the ball stay exactly at centre (22, 14),
  // regardless of where the new formation would otherwise put slot 0.
  const kickoffPiece = result.nextState.pieces.find(p => p.id === "A-0");
  assert.equal(kickoffPiece.x, 22);
  assert.equal(kickoffPiece.y, 14);
  const ball = result.nextState.pieces.find(p => p.id === "ball");
  assert.equal(ball.x, 22);
  assert.equal(ball.y, 14);
});

test("FORMATION_TACTIC_CONFIRMED rejects an invalid team", () => {
  const result = applyGameCommand({
    state: tacticState(), context: tacticContext(),
    command: { id: "confirm-4", type: "FORMATION_TACTIC_CONFIRMED", payload: { team: "green", formationId: 2 } },
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "FORMATION_TACTIC_TEAM_INVALID");
});

test("FORMATION_TACTIC_CONFIRMED rejects a non-numeric formationId", () => {
  const result = applyGameCommand({
    state: tacticState(), context: tacticContext(),
    command: { id: "confirm-5", type: "FORMATION_TACTIC_CONFIRMED", payload: { team: "blue", formationId: "not-a-number" } },
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "FORMATION_TACTIC_INVALID");
});
