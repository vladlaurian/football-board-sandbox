import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../game/gameState.mjs";
import { applyGameCommand } from "./gameEngine.mjs";
import { createMatchContext } from "./matchContext.mjs";
import { selectSinglePlayerPieceActionPresentation } from "./matchPresentationSelectors.mjs";
import { evaluateGroupMovePieceEligibility } from "./groupMoveRules.mjs";
import { firstPlayerHit, bodyBlockingPassOrigin } from "../rules/passEngine.mjs";

// A bench/reserve piece follows the stable id scheme from createInitialPieces:
// "A-R-<n>" / "B-R-<n>". These pieces sit off the board and must never act,
// receive, or be treated as a defender/interceptor once a Match has started.
function reserveMatchState(overrides = {}) {
  return createGameState({
    gameMode: "match",
    pieces: [
      { id: "ball", team: "BALL", x: 3, y: 5 },
      { id: "A-0", team: "A", cardId: "card-blue-1", label: "Blue 1", x: 3, y: 5 },
      { id: "A-R-1", team: "A", cardId: "card-blue-reserve", label: "Blue Reserve", x: -2, y: 5 },
    ],
    tracker: {
      gameStarted: true,
      startingTeam: "blue",
      currentTurn: 1,
      usedActions: { blue: 0, red: 0 },
      actionLog: { blue: [], red: [] },
      matchActionState: {},
      turnPhase: "attack",
      settings: { attackActions: 5, defenseActions: 4, turns: 20 },
    },
    ...overrides,
  });
}

function reserveMatchContext() {
  return createMatchContext({
    id: "reserve-eligibility-context",
    boardSettings: { cols: 20, rows: 12 },
    gameplayCards: [
      { id: "card-blue-1", name: "Blue 1", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 4 }, { id: "stat:passing", name: "Passing", value: 13 }] },
      { id: "card-blue-reserve", name: "Blue Reserve", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 4 }, { id: "stat:passing", name: "Passing", value: 13 }] },
    ],
  });
}

test("PASS_STARTED rejects a bench reserve as passer", () => {
  const result = applyGameCommand({
    state: reserveMatchState(),
    context: reserveMatchContext(),
    command: { id: "reserve-pass", type: "PASS_STARTED", payload: { pieceId: "A-R-1", passId: "p" } },
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "PASSER_INVALID");
});

test("SHOT_STARTED rejects a bench reserve as shooter", () => {
  const result = applyGameCommand({
    state: reserveMatchState({ pieces: [
      { id: "ball", team: "BALL", x: -2, y: 5 },
      { id: "A-0", team: "A", cardId: "card-blue-1", label: "Blue 1", x: 3, y: 5 },
      { id: "A-R-1", team: "A", cardId: "card-blue-reserve", label: "Blue Reserve", x: -2, y: 5 },
    ] }),
    context: reserveMatchContext(),
    command: { id: "reserve-shot", type: "SHOT_STARTED", payload: { pieceId: "A-R-1", shotId: "s" } },
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "SHOT_UNAVAILABLE");
});

test("THROUGH_BALL_STARTED rejects a bench reserve as passer", () => {
  const result = applyGameCommand({
    state: reserveMatchState(),
    context: reserveMatchContext(),
    command: { id: "reserve-tb", type: "THROUGH_BALL_STARTED", payload: { pieceId: "A-R-1", throughBallId: "t" } },
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "THROUGH_BALL_NOT_AVAILABLE");
});

test("LOFTED_THROUGH_BALL_STARTED rejects a bench reserve as passer", () => {
  const result = applyGameCommand({
    state: reserveMatchState(),
    context: reserveMatchContext(),
    command: { id: "reserve-ltb", type: "LOFTED_THROUGH_BALL_STARTED", payload: { pieceId: "A-R-1", loftedThroughBallId: "l" } },
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "LOFTED_THROUGH_BALL_NOT_AVAILABLE");
});

test("NORMAL_MOVE_STARTED rejects a bench reserve as mover", () => {
  const result = applyGameCommand({
    state: reserveMatchState(),
    context: reserveMatchContext(),
    command: { id: "reserve-move", type: "NORMAL_MOVE_STARTED", payload: { pieceId: "A-R-1" } },
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "MOVE_PIECE_INVALID");
});

test("BONUS_MOVE_STARTED rejects a bench reserve as mover", () => {
  const result = applyGameCommand({
    state: reserveMatchState(),
    context: reserveMatchContext(),
    command: { id: "reserve-bonus-move", type: "BONUS_MOVE_STARTED", payload: { pieceId: "A-R-1" } },
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "MOVE_PIECE_INVALID");
});

test("FREE_MOVE_STARTED rejects a bench reserve as mover", () => {
  const result = applyGameCommand({
    state: reserveMatchState(),
    context: reserveMatchContext(),
    command: { id: "reserve-free-move", type: "FREE_MOVE_STARTED", payload: { pieceId: "A-R-1" } },
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "FREE_MOVE_PIECE_INVALID");
});

test("group-move eligibility rejects a bench reserve even inside the zone bounds", () => {
  const state = reserveMatchState({
    pieces: [
      { id: "ball", team: "BALL", x: 3, y: 5 },
      { id: "A-0", team: "A", cardId: "card-blue-1", label: "Blue 1", x: 3, y: 5 },
      { id: "A-R-1", team: "A", cardId: "card-blue-reserve", label: "Blue Reserve", x: 4, y: 5 },
    ],
    tracker: {
      gameStarted: true,
      startingTeam: "blue",
      currentTurn: 1,
      usedActions: { blue: 5, red: 0 },
      actionLog: { blue: [{ type: "GROUP_MOVE" }, { type: "GROUP_MOVE" }, { type: "GROUP_MOVE" }, { type: "GROUP_MOVE" }, { type: "GROUP_MOVE" }], red: [] },
      matchActionState: {
        groupMove: { active: true, team: "blue", zoneStartX: 0, zoneLength: 20, movedPieceIds: [], maxPlayers: 3 },
      },
      turnPhase: "attack",
      settings: { attackActions: 5, defenseActions: 4, turns: 20 },
    },
  });
  const result = evaluateGroupMovePieceEligibility(state, { payload: { pieceId: "A-R-1" } });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "GROUP_MOVE_PIECE_INVALID");
});

test("selectSinglePlayerPieceActionPresentation blocks every action for a bench reserve, even if it could otherwise inspect fine", () => {
  const state = reserveMatchState();
  const reservePiece = state.pieces.find(piece => piece.id === "A-R-1");
  const presentation = selectSinglePlayerPieceActionPresentation(state, { piece: reservePiece });
  assert.equal(presentation.actionAllowed, false);
  assert.equal(presentation.freeAllowed, false);
  assert.equal(presentation.groupMoveAuthorized, false);
  assert.equal(presentation.movementAuthorization.allowed, false);
});

test("selectSinglePlayerPieceActionPresentation still allows a real starter", () => {
  const state = reserveMatchState();
  const starter = state.pieces.find(piece => piece.id === "A-0");
  const presentation = selectSinglePlayerPieceActionPresentation(state, { piece: starter });
  assert.equal(presentation.actionAllowed, true);
});

test("firstPlayerHit never returns a bench reserve standing directly on the route", () => {
  const passer = { id: "A-0", team: "A", x: 0, y: 0 };
  const reserve = { id: "B-R-1", team: "B", x: 3, y: 0 };
  const hit = firstPlayerHit({ x: 0.5, y: 0.5 }, { x: 5.5, y: 0.5 }, [passer, reserve], passer.id);
  assert.equal(hit, null);
});

test("bodyBlockingPassOrigin ignores a bench reserve occupying the origin corner square", () => {
  const passer = { id: "A-0", team: "A", x: 2, y: 2 };
  const reserve = { id: "A-R-1", team: "A", x: 2, y: 1 };
  const origin = { cornerId: "top-left", x: 2, y: 2 };
  const blocker = bodyBlockingPassOrigin(origin, passer, [passer, reserve]);
  assert.equal(blocker, null);
});
