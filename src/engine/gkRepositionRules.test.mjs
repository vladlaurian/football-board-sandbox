import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../game/gameState.mjs";
import { createMatchContext } from "../engine/matchContext.mjs";
import {
  buildGkReposition,
  gkRepositionTriggerApplies,
  selectGkRepositionPiece,
  evaluateGkRepositionMove,
  commitGkRepositionMove,
  endGkRepositionTurn,
} from "./gkRepositionRules.mjs";
import { createDefaultRuleSet } from "../rules/ruleSets.mjs";

function ruleSetWith(overrides = {}) {
  const base = createDefaultRuleSet();
  return { ...base, actions: { ...base.actions, shot: { ...base.actions.shot, goalkeeperRetainsReposition: { count: 2, afterFreeKick: false, afterCornerHeader: false, anyCatch: false, ...overrides } } } };
}

function state(overrides = {}) {
  return createGameState({
    gameMode: "match",
    pieces: [
      { id: "ball", team: "BALL", x: 3, y: 5 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 3, y: 5 },
      { id: "red-1", team: "B", cardId: "card-red-1", x: 10, y: 5 },
    ],
    ...overrides,
  });
}

function context() {
  return createMatchContext({
    id: "gk-reposition-context",
    boardSettings: { cols: 20, rows: 12 },
    gameplayCards: [
      { id: "card-blue-1", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 4 }] },
      { id: "card-red-1", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 4 }] },
    ],
  });
}

test("buildGkReposition returns null when count is 0 — the field's own documented meaning", () => {
  assert.equal(buildGkReposition(ruleSetWith({ count: 0 }), "blue"), null);
});

test("buildGkReposition starts with the goalkeeper's own team first, both sides holding the full count", () => {
  const built = buildGkReposition(ruleSetWith({ count: 3 }), "blue");
  assert.deepEqual(built, { team: "blue", opponentTeam: "red", turn: "self", remaining: { self: 3, opponent: 3 }, count: 3, activePieceId: null, usedPieceIds: [] });
});

test("gkRepositionTriggerApplies reads each of the 3 checkboxes independently", () => {
  const ruleSet = ruleSetWith({ afterFreeKick: true, afterCornerHeader: false, anyCatch: false });
  assert.equal(gkRepositionTriggerApplies(ruleSet, "afterFreeKick"), true);
  assert.equal(gkRepositionTriggerApplies(ruleSet, "afterCornerHeader"), false);
  assert.equal(gkRepositionTriggerApplies(ruleSet, "anyCatch"), false);
});

test("selecting a piece for the wrong side, or with no moves left, is rejected", () => {
  const gkReposition = buildGkReposition(ruleSetWith({ count: 1 }), "blue");
  const s = state({ gkReposition });
  const wrongSide = selectGkRepositionPiece(s, context(), { payload: { pieceId: "red-1" } });
  assert.equal(wrongSide.accepted, false);
  assert.equal(wrongSide.reason, "GK_REPOSITION_WRONG_TEAM");
  const ok = selectGkRepositionPiece(s, context(), { payload: { pieceId: "blue-1" } });
  assert.equal(ok.accepted, true);
  assert.equal(ok.nextState.gkReposition.activePieceId, "blue-1");
});

test("one piece per turn (reported live): once a piece is active, a different piece cannot be picked until the turn ends, but re-picking the same one is a harmless no-op", () => {
  const gkReposition = buildGkReposition(ruleSetWith({ count: 2 }), "blue");
  const s = state({
    gkReposition,
    pieces: [
      { id: "ball", team: "BALL", x: 3, y: 5 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 3, y: 5 },
      { id: "blue-2", team: "A", cardId: "card-blue-1", x: 6, y: 5 },
    ],
  });
  const first = selectGkRepositionPiece(s, context(), { payload: { pieceId: "blue-1" } });
  assert.equal(first.accepted, true);
  const switched = selectGkRepositionPiece(first.nextState, context(), { payload: { pieceId: "blue-2" } });
  assert.equal(switched.accepted, false);
  assert.equal(switched.reason, "GK_REPOSITION_PIECE_ALREADY_ACTIVE", "reported live: this let the coach move as many different pieces as they wanted in one turn");
  const reselectSame = selectGkRepositionPiece(first.nextState, context(), { payload: { pieceId: "blue-1" } });
  assert.equal(reselectSame.accepted, true);
  assert.equal(reselectSame.nextState.gkReposition.activePieceId, "blue-1");
});

test("a piece already used on an earlier turn can never be picked again this phase (reported live: otherwise the same piece could chain several turns' worth of Speed, e.g. walking into the opponent's box)", () => {
  const gkReposition = { ...buildGkReposition(ruleSetWith({ count: 3 }), "blue"), activePieceId: "blue-1" };
  const s = state({
    gkReposition,
    pieces: [
      { id: "ball", team: "BALL", x: 3, y: 5 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 3, y: 5 },
      { id: "blue-2", team: "A", cardId: "card-blue-1", x: 6, y: 5 },
    ],
  });
  const ended = endGkRepositionTurn(s, context(), {});
  assert.equal(ended.accepted, true);
  assert.deepEqual(ended.nextState.gkReposition.usedPieceIds, ["blue-1"]);
  assert.equal(ended.nextState.gkReposition.turn, "opponent");
  // Two opponent turns later (opponent doesn't have blue-1 anyway, but
  // let's fast-forward straight back to "self" to prove the retirement
  // survives the round trip):
  const backToSelf = { ...ended.nextState, gkReposition: { ...ended.nextState.gkReposition, turn: "self" } };
  const reuseAttempt = selectGkRepositionPiece(backToSelf, context(), { payload: { pieceId: "blue-1" } });
  assert.equal(reuseAttempt.accepted, false);
  assert.equal(reuseAttempt.reason, "GK_REPOSITION_PIECE_ALREADY_USED");
  // blue-2 (never used) is still fine.
  const freshPiece = selectGkRepositionPiece(backToSelf, context(), { payload: { pieceId: "blue-2" } });
  assert.equal(freshPiece.accepted, true);
});

test("a selected piece can move using real Speed-limited legality, carrying the ball with it", () => {
  const gkReposition = { ...buildGkReposition(ruleSetWith({ count: 2 }), "blue"), activePieceId: "blue-1" };
  const s = state({ gkReposition });
  const moved = commitGkRepositionMove(s, context(), { payload: { pieceId: "blue-1", x: 5, y: 5 } });
  assert.equal(moved.accepted, true);
  const blue1 = moved.nextState.pieces.find(piece => piece.id === "blue-1");
  const ball = moved.nextState.pieces.find(piece => piece.id === "ball");
  assert.equal(blue1.x, 5);
  assert.equal(ball.x, 5, "the carried ball follows the moved piece");
  assert.equal(moved.nextState.gkRepositionMovementByPieceId["blue-1"].spent, 2);
  // Untracked: nothing in the ordinary Tracker/movementStateByPieceId moved.
  assert.deepEqual(moved.nextState.movementStateByPieceId, {});
});

test("a move beyond the piece's own Speed is rejected, exactly like Normal Move", () => {
  const gkReposition = { ...buildGkReposition(ruleSetWith({ count: 2 }), "blue"), activePieceId: "blue-1" };
  const s = state({ gkReposition });
  const tooFar = evaluateGkRepositionMove(s, context(), { payload: { pieceId: "blue-1", x: 8, y: 5 } });
  assert.equal(tooFar.accepted, false);
  assert.equal(tooFar.reason, "speed");
});

test("a piece not yet selected as the turn's active piece cannot commit a move, but previews fine", () => {
  const gkReposition = buildGkReposition(ruleSetWith({ count: 2 }), "blue");
  const s = state({ gkReposition });
  const blocked = evaluateGkRepositionMove(s, context(), { payload: { pieceId: "blue-1", x: 5, y: 5 } });
  assert.equal(blocked.accepted, false);
  assert.equal(blocked.reason, "GK_REPOSITION_PIECE_NOT_ACTIVE");
  const previewed = evaluateGkRepositionMove(s, context(), { payload: { pieceId: "blue-1", x: 5, y: 5 } }, { preview: true });
  assert.equal(previewed.accepted, true);
});

test("ending a turn alternates self/opponent, self first, and closes the whole phase once both are exhausted", () => {
  const gkReposition = { ...buildGkReposition(ruleSetWith({ count: 1 }), "blue"), activePieceId: "blue-1" };
  const s = state({ gkReposition, gkRepositionMovementByPieceId: { "blue-1": { axis: "horizontal", spent: 2, distance: 2 } } });
  const afterSelf = endGkRepositionTurn(s, context(), {});
  assert.equal(afterSelf.accepted, true);
  assert.equal(afterSelf.nextState.gkReposition.turn, "opponent");
  assert.equal(afterSelf.nextState.gkReposition.remaining.self, 0);
  assert.deepEqual(afterSelf.nextState.gkRepositionMovementByPieceId, {}, "the finished piece's session state is cleared");
  const afterOpponent = endGkRepositionTurn(afterSelf.nextState, context(), {});
  assert.equal(afterOpponent.accepted, true);
  assert.equal(afterOpponent.nextState.gkReposition, null, "both sides exhausted — the whole phase closes");
  assert.deepEqual(afterOpponent.nextState.gkRepositionMovementByPieceId, {});
});

test("ending a turn skips a side entirely once it has no moves left, going straight back to the other", () => {
  let gkReposition = buildGkReposition(ruleSetWith({ count: 1 }), "blue");
  gkReposition = { ...gkReposition, remaining: { self: 0, opponent: 1 }, turn: "opponent" };
  const s = state({ gkReposition });
  const result = endGkRepositionTurn(s, context(), {});
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.gkReposition, null, "opponent's last move ends the phase (self already at 0)");
});

test("without an active gkReposition, every command is rejected", () => {
  const s = state({ gkReposition: null });
  assert.equal(selectGkRepositionPiece(s, context(), { payload: { pieceId: "blue-1" } }).accepted, false);
  assert.equal(evaluateGkRepositionMove(s, context(), { payload: { pieceId: "blue-1", x: 5, y: 5 } }).accepted, false);
  assert.equal(endGkRepositionTurn(s, context(), {}).accepted, false);
});
