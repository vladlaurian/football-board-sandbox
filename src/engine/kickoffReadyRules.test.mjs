import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../game/gameState.mjs";
import { applyGameCommand } from "./gameEngine.mjs";
import { createMatchContext } from "./matchContext.mjs";
import { formationById } from "../board/standardFormations.mjs";
import { formationStarterCoordinates } from "../board/formationLayout.mjs";

const BOARD_SETTINGS = { cols: 44, rows: 29, invisiblePadding: 2, goalWidth: 5 };

function cardsForFormation(formationId) {
  const cardsById = {};
  formationById(formationId).starterRoleRecipe.forEach((role, index) => {
    cardsById[`card-${index}`] = { id: `card-${index}`, position: role };
  });
  return cardsById;
}

function readyState(overrides = {}) {
  return createGameState({
    gameMode: "match",
    pieces: [
      { id: "ball", team: "BALL", x: 22, y: 14 },
      ...formationById(1).starterRoleRecipe.map((_, index) => ({ id: `A-${index}`, team: "A", cardId: `card-${index}`, x: 0, y: 0 })),
    ],
    activeFormation: { blue: 1, red: null },
    kickoffRestart: { team: "blue", pieceId: "A-9" },
    tracker: {
      gameStarted: true, startingTeam: "blue", currentTurn: 5,
      usedActions: { blue: 0, red: 0 }, actionLog: { blue: [], red: [] }, matchActionState: {}, turnPhase: "attack",
      settings: { attackActions: 5, defenseActions: 4, turns: 20 },
    },
    ...overrides,
  });
}

function readyContext() {
  return createMatchContext({ id: "kickoff-ready-context", boardSettings: BOARD_SETTINGS, gameplayCards: Object.values(cardsForFormation(1)) });
}

test("KICKOFF_READY_CONFIRMED rejects when no kickoff restart is pending for that team", () => {
  const result = applyGameCommand({
    state: readyState({ kickoffRestart: null }), context: readyContext(),
    command: { id: "ready-1", type: "KICKOFF_READY_CONFIRMED", payload: { team: "blue" } },
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "NOT_AT_KICKOFF_RESTART");
});

test("KICKOFF_READY_CONFIRMED rejects an illegal tactic without moving anything", () => {
  // Formation 16 (5-4-1) needs a 5th defender the fixture's 4-4-2 cards can't supply.
  const state = readyState({ activeFormation: { blue: 16, red: null } });
  const result = applyGameCommand({
    state, context: readyContext(),
    command: { id: "ready-2", type: "KICKOFF_READY_CONFIRMED", payload: { team: "blue" } },
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "TEAM_TACTIC_INVALID");
});

test("KICKOFF_READY_CONFIRMED re-lays out the team, then pins the CURRENT tactic's ST and the ball to centre", () => {
  // A-9 (originally pinned by an earlier goal) is not this formation's ST
  // slot by itself — Ready must pick whichever piece IS the ST now (A-9 or
  // A-10, both ST in formation 1) and reposition every other slot for real.
  const state = readyState();
  const result = applyGameCommand({
    state, context: readyContext(),
    command: { id: "ready-3", type: "KICKOFF_READY_CONFIRMED", payload: { team: "blue" } },
  });
  assert.equal(result.accepted, true);
  const stCardIds = formationById(1).starterRoleRecipe
    .map((role, index) => (role === "ST" ? `A-${index}` : null))
    .filter(Boolean);
  const kickoffPieceId = result.nextState.kickoffRestart.pieceId;
  assert.ok(stCardIds.includes(kickoffPieceId), `expected ST slot, got ${kickoffPieceId}`);
  const kickoffPiece = result.nextState.pieces.find(p => p.id === kickoffPieceId);
  assert.equal(kickoffPiece.x, 22);
  assert.equal(kickoffPiece.y, 14);
  const ball = result.nextState.pieces.find(p => p.id === "ball");
  assert.equal(ball.x, 22);
  assert.equal(ball.y, 14);
  // A non-kickoff slot is repositioned to its real formation coordinate,
  // not left wherever it was.
  const expected = formationStarterCoordinates("A", formationById(1), BOARD_SETTINGS);
  const otherSlotId = stCardIds.includes("A-0") ? "A-1" : "A-0";
  const expectedSlot = expected.find(coord => coord.id === otherSlotId);
  const otherPiece = result.nextState.pieces.find(p => p.id === otherSlotId);
  assert.equal(otherPiece.x, expectedSlot.x);
  assert.equal(otherPiece.y, expectedSlot.y);
});

test("KICKOFF_READY_CONFIRMED rejects the wrong team", () => {
  const result = applyGameCommand({
    state: readyState(), context: readyContext(),
    command: { id: "ready-4", type: "KICKOFF_READY_CONFIRMED", payload: { team: "red" } },
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "NOT_AT_KICKOFF_RESTART");
});
