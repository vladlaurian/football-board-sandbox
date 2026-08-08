import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../game/gameState.mjs";
import { applyGameCommand } from "./gameEngine.mjs";
import { createMatchContext } from "./matchContext.mjs";
import { formationById } from "../board/standardFormations.mjs";
import { isTeamTacticLegal } from "./tacticLegalityRules.mjs";

const BOARD_SETTINGS = { cols: 44, rows: 29, invisiblePadding: 2, goalWidth: 5 };

test("isTeamTacticLegal is true with no tactic tracked (Continue Game never sets one)", () => {
  assert.equal(isTeamTacticLegal([], {}, "A", null), true);
});

function blueStarterPieces(cardIdsByRole) {
  return formationById(1).starterRoleRecipe.map((role, index) => ({
    id: `A-${index}`, team: "A", cardId: cardIdsByRole[role] || null, x: 0, y: 0,
  }));
}

function cardsForRecipe() {
  // Every card matches its 4-4-2 (2 CM) slot exactly.
  const cardsById = {};
  formationById(1).starterRoleRecipe.forEach((role, index) => {
    cardsById[`card-${index}`] = { id: `card-${index}`, position: role };
  });
  return cardsById;
}

test("isTeamTacticLegal is true when every assigned card matches its formation slot", () => {
  const cardsById = cardsForRecipe();
  const pieces = formationById(1).starterRoleRecipe.map((_, index) => ({ id: `A-${index}`, team: "A", cardId: `card-${index}`, x: 0, y: 0 }));
  assert.equal(isTeamTacticLegal(pieces, cardsById, "A", 1), true);
});

test("isTeamTacticLegal is false when an assigned card's role doesn't match its slot", () => {
  const cardsById = cardsForRecipe();
  // Swap two cards so slot 0 (GK) gets a CB card instead.
  const pieces = formationById(1).starterRoleRecipe.map((_, index) => ({ id: `A-${index}`, team: "A", cardId: `card-${index}`, x: 0, y: 0 }));
  pieces[0] = { ...pieces[0], cardId: "card-2" };
  assert.equal(isTeamTacticLegal(pieces, cardsById, "A", 1), false);
});

function tacticState(overrides = {}) {
  // Pre-Match (gameStarted: false) is trivially a kickoff moment, so
  // FORMATION_TACTIC_CONFIRMED applies (and validates) immediately instead
  // of merely queuing — exactly what these tests need to exercise.
  return createGameState({
    gameMode: "match",
    pieces: [{ id: "ball", team: "BALL", x: 22, y: 14 }, ...formationById(1).starterRoleRecipe.map((_, index) => ({ id: `A-${index}`, team: "A", cardId: `card-${index}`, x: 0, y: 0 }))],
    tracker: {
      gameStarted: false, startingTeam: "blue", currentTurn: 0,
      usedActions: { blue: 0, red: 0 }, actionLog: { blue: [], red: [] }, matchActionState: {}, turnPhase: "attack",
      settings: { attackActions: 5, defenseActions: 4, turns: 20 },
    },
    ...overrides,
  });
}

function tacticContext() {
  return createMatchContext({ id: "tactic-legality-context", boardSettings: BOARD_SETTINGS, gameplayCards: Object.values(cardsForRecipe()) });
}

test("FORMATION_TACTIC_CONFIRMED sets tacticBlock when the newly applied formation doesn't match assigned cards", () => {
  // Formation 16 (5-4-1: GK,LB,CB,CB,CB,RB,LM,CM,CM,RM,ST) needs a 5th
  // defender the fixture's cards (built for 4-4-2) cannot supply.
  const result = applyGameCommand({
    state: tacticState(), context: tacticContext(),
    command: { id: "confirm-bad", type: "FORMATION_TACTIC_CONFIRMED", payload: { team: "blue", formationId: 16 } },
  });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.tacticBlock.blue, true);
});

test("FORMATION_TACTIC_CONFIRMED clears tacticBlock once a matching formation is confirmed", () => {
  const blocked = applyGameCommand({
    state: tacticState(), context: tacticContext(),
    command: { id: "confirm-bad-2", type: "FORMATION_TACTIC_CONFIRMED", payload: { team: "blue", formationId: 16 } },
  });
  const fixed = applyGameCommand({
    state: blocked.nextState, context: tacticContext(),
    command: { id: "confirm-good", type: "FORMATION_TACTIC_CONFIRMED", payload: { team: "blue", formationId: 1 } },
  });
  assert.equal(fixed.accepted, true);
  assert.equal(fixed.nextState.tacticBlock.blue, false);
});

test("a tactic-blocked team cannot start a Pass, Shot, or Move", () => {
  const blocked = applyGameCommand({
    state: tacticState(), context: tacticContext(),
    command: { id: "confirm-bad-3", type: "FORMATION_TACTIC_CONFIRMED", payload: { team: "blue", formationId: 16 } },
  }).nextState;
  const pass = applyGameCommand({ state: blocked, context: tacticContext(), command: { id: "blocked-pass", type: "PASS_STARTED", payload: { pieceId: "A-0", passId: "p" } } });
  assert.equal(pass.accepted, false);
  assert.equal(pass.reason, "TEAM_TACTIC_INVALID");
  const move = applyGameCommand({ state: blocked, context: tacticContext(), command: { id: "blocked-move", type: "NORMAL_MOVE_STARTED", payload: { pieceId: "A-0" } } });
  assert.equal(move.accepted, false);
  assert.equal(move.reason, "TEAM_TACTIC_INVALID");
});
