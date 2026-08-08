import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../game/gameState.mjs";
import { applyGameCommand } from "./gameEngine.mjs";
import { createMatchContext } from "./matchContext.mjs";

// Offside Build 1 (docs/GAMEPLAY_RULES_FOUNDATIONS.md section 6) — Short/
// Long Pass only. Through Ball/Lofted Through Ball are a separate build
// (their ball can land in open space with no synchronous recipient).
//
// Board is 20 wide; team A ("blue") attacks toward higher x, team B
// ("red") defends there — matches Shot's own isLegalGoalTarget convention.
// Defenders sit off the pass's own row (y=5) so they never become
// interception candidates — this build only cares about their x position
// for the second-last-opponent ranking.

function state(overrides = {}) {
  return createGameState({
    gameMode: "match",
    pieces: [
      { id: "ball", team: "BALL", x: 5, y: 5 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 5, y: 5 },
      { id: "blue-2", team: "A", cardId: "card-blue-2", x: 18, y: 5 },
      { id: "red-gk", team: "B", cardId: "card-red-gk", x: 19, y: 8 },
      { id: "red-df", team: "B", cardId: "card-red-df", x: 12, y: 9 },
    ],
    tracker: {
      gameStarted: true, startingTeam: "blue", currentTurn: 1, turnPhase: "attack",
      usedActions: { blue: 0, red: 0 }, actionLog: { blue: [], red: [] }, personalActionsByPieceId: {}, matchActionState: {},
      settings: { attackActions: 5, defenseActions: 4, turns: 20 },
    },
    ...overrides,
  });
}

function context(overrides = {}) {
  return createMatchContext({
    id: "pass-offside-context",
    boardSettings: { cols: 20, rows: 12 },
    gameplayCards: [
      { id: "card-blue-1", passiveAttributes: [{ id: "stat:passing", name: "Passing", value: 10 }] },
      { id: "card-blue-2", passiveAttributes: [{ id: "stat:passing", name: "Passing", value: 10 }] },
      { id: "card-red-gk", position: "GK" },
      { id: "card-red-df", position: "DF" },
    ],
    ...overrides,
  });
}

function completePassTo(rawState, matchContext, target) {
  const started = applyGameCommand({ state: rawState, context: matchContext, command: { id: "pass-start", type: "PASS_STARTED", payload: { pieceId: "blue-1", passId: "pass-1" } } });
  assert.equal(started.accepted, true);
  const targeted = applyGameCommand({ state: started.nextState, context: matchContext, command: { id: "pass-target", type: "PASS_TARGET_SELECTED", payload: { passId: "pass-1", x: target.x, y: target.y } } });
  assert.equal(targeted.accepted, true);
  const confirmed = applyGameCommand({ state: targeted.nextState, context: matchContext, command: { id: "pass-route", type: "PASS_ROUTE_CONFIRMED", payload: { passId: "pass-1", cornerId: "top-left" } } });
  assert.equal(confirmed.accepted, true);
  assert.equal(confirmed.nextState.actionResolution.status, "completing", "no interceptor is in range of this route, so it resolves directly");
  return applyGameCommand({ state: confirmed.nextState, context: matchContext, command: { id: "pass-consequence", type: "PASS_CONSEQUENCE_DUE", payload: { passId: "pass-1" } } });
}

test("a recipient beyond the second-last opponent, past the halfway line and past the ball, is offside", () => {
  // blue-2 at x=18: beyond halfway (10), beyond the passer (5), and beyond
  // the second-last red defender (red-df at x=12; red-gk at x=19 is last).
  const result = completePassTo(state(), context(), { x: 18, y: 5 });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.actionResolution.kind, "offside");
  assert.equal(result.nextState.actionResolution.status, "result-display");
  assert.equal(result.nextState.actionResolution.result.offside, true);
  assert.equal(result.nextState.actionResolution.result.recipientId, "blue-2");
  assert.equal(result.nextState.pendingRestartResult.type, "indirectFreeKick");
  assert.equal(result.nextState.pendingRestartResult.team, "red");
  assert.deepEqual(result.nextState.pendingRestartResult.spot, { x: 18, y: 5 });
  // The pass never completes: the ball stays with the passer.
  const ball = result.nextState.pieces.find(piece => piece.id === "ball");
  assert.equal(ball.x, 5); assert.equal(ball.y, 5);
});

test("a recipient level with the second-last opponent is onside (not beyond)", () => {
  const result = completePassTo(state(), context(), { x: 12, y: 5 });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.actionResolution, null, "an ordinary completed pass clears actionResolution");
  const ball = result.nextState.pieces.find(piece => piece.id === "ball");
  assert.equal(ball.x, 12); assert.equal(ball.y, 5);
});

test("a recipient in the team's own half is onside regardless of the defensive line", () => {
  const ownHalfState = state({ pieces: [
    { id: "ball", team: "BALL", x: 3, y: 5 },
    { id: "blue-1", team: "A", cardId: "card-blue-1", x: 3, y: 5 },
    { id: "blue-2", team: "A", cardId: "card-blue-2", x: 9, y: 5 },
    { id: "red-gk", team: "B", cardId: "card-red-gk", x: 19, y: 8 },
    { id: "red-df", team: "B", cardId: "card-red-df", x: 8, y: 9 },
  ] });
  const result = completePassTo(ownHalfState, context(), { x: 9, y: 5 });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.actionResolution, null);
});

test("a backward pass to a recipient behind the ball cannot be offside", () => {
  const backState = state({ pieces: [
    { id: "ball", team: "BALL", x: 15, y: 5 },
    { id: "blue-1", team: "A", cardId: "card-blue-1", x: 15, y: 5 },
    { id: "blue-2", team: "A", cardId: "card-blue-2", x: 18, y: 3 },
    { id: "red-gk", team: "B", cardId: "card-red-gk", x: 19, y: 8 },
    { id: "red-df", team: "B", cardId: "card-red-df", x: 12, y: 9 },
  ] });
  // blue-2 receives a backward pass to (11,3): behind the passer (15).
  const result = completePassTo(backState, context(), { x: 11, y: 3 });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.actionResolution, null);
});

test("the goalkeeper counts in the second-last-opponent ranking", () => {
  // Only the GK stands between blue-2 and the goal line — with no outfield
  // defender at all, there is no genuine second-last opponent, so this
  // build treats the recipient as not offside (documented simplification —
  // a real 11 v 11 game always has one).
  const onlyGkState = state({ pieces: [
    { id: "ball", team: "BALL", x: 5, y: 5 },
    { id: "blue-1", team: "A", cardId: "card-blue-1", x: 5, y: 5 },
    { id: "blue-2", team: "A", cardId: "card-blue-2", x: 18, y: 5 },
    { id: "red-gk", team: "B", cardId: "card-red-gk", x: 19, y: 8 },
  ] });
  const result = completePassTo(onlyGkState, context(), { x: 18, y: 5 });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.actionResolution, null);
});

test("the offside result screen's Continue transitions into the shared Indirect Free Kick restart setup", () => {
  const result = completePassTo(state(), context(), { x: 18, y: 5 });
  assert.equal(result.accepted, true);
  const confirmed = applyGameCommand({
    state: result.nextState, context: context(),
    command: { id: "offside-restart-confirm", type: "OFFSIDE_RESTART_CONFIRMED", payload: {} },
  });
  assert.equal(confirmed.accepted, true);
  assert.equal(confirmed.nextState.actionResolution, null);
  assert.equal(confirmed.nextState.pendingRestartResult, null);
  assert.equal(confirmed.nextState.restartSetup?.type, "freeKickIndirect");
  // The offside player's own position (blue-2, x:18) is where the pass was
  // received — not the passer's (blue-1's) position.
  assert.equal(confirmed.nextState.restartSetup?.team, "red", "the defending team is entitled to the restart");
  assert.deepEqual(confirmed.nextState.restartSetup?.ballCell, { x: 18, y: 5 });
  assert.ok(!confirmed.nextState.restartSetup?.availableActions.includes("shot"), "an Indirect Free Kick can never be shot directly");
  // The voided pass left the ball with the passer (x:5) — Continue must
  // actually move the ball piece to the restart spot (x:18), not just
  // record it as ballCell (reported live: the ball stayed put in the UI).
  const ball = confirmed.nextState.pieces.find(piece => piece.id === "ball");
  assert.deepEqual({ x: ball.x, y: ball.y }, { x: 18, y: 5 }, "the ball piece itself is moved to the restart spot");
  // Offside genuinely changes possession — a real turn advance, unlike
  // Tackling's own foul (see the matching assertions in
  // tacklingRules.test.mjs for the no-possession-change, same-turn case).
  assert.equal(confirmed.nextState.tracker.currentTurn, 2, "a new numbered turn begins");
  assert.equal(confirmed.nextState.tracker.startingTeam, "red", "the entitled (defending) team starts the new turn");
  assert.equal(confirmed.nextState.tracker.turnPhase, "attack");
  assert.deepEqual(confirmed.nextState.movementStateByPieceId, {}, "individual movement state resets");
});

test("an intercepted pass is never checked for offside", () => {
  const interceptedState = state({ pieces: [
    { id: "ball", team: "BALL", x: 5, y: 5 },
    { id: "blue-1", team: "A", cardId: "card-blue-1", x: 5, y: 5 },
    { id: "red-mid", team: "B", cardId: "card-red-df", x: 18, y: 5 },
  ] });
  // A direct hit: the target cell itself is occupied by an opponent instead
  // of a teammate — resolved as an interception, never reaching the
  // offside check at all.
  const started = applyGameCommand({ state: interceptedState, context: context(), command: { id: "pass-start", type: "PASS_STARTED", payload: { pieceId: "blue-1", passId: "pass-1" } } });
  const targeted = applyGameCommand({ state: started.nextState, context: context(), command: { id: "pass-target", type: "PASS_TARGET_SELECTED", payload: { passId: "pass-1", x: 18, y: 5 } } });
  const confirmed = applyGameCommand({ state: targeted.nextState, context: context(), command: { id: "pass-route", type: "PASS_ROUTE_CONFIRMED", payload: { passId: "pass-1", cornerId: "top-left" } } });
  assert.equal(confirmed.accepted, true, `route confirm should be accepted: ${confirmed.reason}`);
  assert.equal(confirmed.nextState.actionResolution.plan?.directHit?.pieceId, "red-mid");
  const consequence = applyGameCommand({ state: confirmed.nextState, context: context(), command: { id: "pass-consequence", type: "PASS_CONSEQUENCE_DUE", payload: { passId: "pass-1" } } });
  assert.equal(consequence.accepted, true);
  assert.equal(consequence.nextState.actionResolution, null, "a direct-hit interception clears actionResolution, never freezing for offside");
  assert.equal(consequence.nextState.pendingRestartResult, null);
  const ball = consequence.nextState.pieces.find(piece => piece.id === "ball");
  assert.equal(ball.x, 18, "the intercepting opponent now has the ball");
});
