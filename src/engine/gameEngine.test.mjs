import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createGameState } from "../game/gameState.mjs";
import { applyGameCommand } from "./gameEngine.mjs";
import { evaluateGroupMovePieceEligibility, evaluateGroupMovePlayer } from "./groupMoveRules.mjs";
import { createMatchContext } from "./matchContext.mjs";

function matchState() {
  return createGameState({
    gameMode: "match",
    pieces: [
      { id: "ball", team: "BALL", x: 4, y: 5 },
      { id: "blue-1", team: "blue", x: 3, y: 5 },
    ],
  });
}

function moveBallCommand(overrides = {}) {
  return {
    id: "cmd-free-ball-1",
    type: "FREE_BALL_MOVED",
    payload: { x: 7, y: 8 },
    ...overrides,
  };
}

function normalMoveState(overrides = {}) {
  return createGameState({
    gameMode: "match",
    pieces: [
      { id: "ball", team: "BALL", x: 3, y: 5 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", label: "Blue 1", x: 3, y: 5 },
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

function normalMoveContext() {
  return createMatchContext({
    id: "normal-move-context",
    boardSettings: { cols: 20, rows: 12 },
    gameplayCards: [
      { id: "card-blue-1", name: "Blue 1", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 4 }, { id: "stat:passing", name: "Passing", value: 13 }] },
      { id: "card-red-1", name: "Red 1", defensiveArea: [{ dx: 2, dy: 0 }] },
      { id: "card-red-2", name: "Red 2", defensiveArea: [{ dx: -2, dy: 0 }] },
    ],
  });
}

function normalMoveCommand(type, payload = {}, id = type.toLowerCase()) {
  return { id, type, payload: { pieceId: "blue-1", ...payload } };
}

function confirmedPass(state, passId, context = normalMoveContext()) {
  const started = applyGameCommand({
    state, context,
    command: { id: `${passId}-start`, type: "PASS_STARTED", payload: { pieceId: "blue-1", passId } },
  });
  const targeted = applyGameCommand({
    state: started.nextState, context,
    command: { id: `${passId}-target`, type: "PASS_TARGET_SELECTED", payload: { passId, x: 9, y: 5 } },
  });
  const confirmed = applyGameCommand({
    state: targeted.nextState, context,
    command: { id: `${passId}-route`, type: "PASS_ROUTE_CONFIRMED", payload: { passId, cornerId: "top-left" } },
  });
  return { context, confirmed };
}

function resolvedPassInterception(state, passId, natural, context = normalMoveContext()) {
  const { confirmed, ...rest } = confirmedPass(state, passId, context);
  const pendingRoll = confirmed.nextState.actionResolution.pendingRoll;
  const rolled = applyGameCommand({
    state: confirmed.nextState, context,
    command: {
      id: `${passId}-roll`, type: "PASS_INTERCEPTION_ROLL_SUBMITTED",
      payload: {
        passId,
        createdAt: 1000,
        rollEvent: { id: `${passId}-roll-event`, requestId: pendingRoll.requestId, actionId: passId, team: "red", dieType: 20, natural, source: "RANDOM", createdAt: 1000, subjectId: pendingRoll.subjectId, reactionIndex: 0 },
      },
    },
  });
  const resolved = applyGameCommand({
    state: rolled.nextState, context,
    command: { id: `${passId}-resolution`, type: "PASS_INTERCEPTION_RESOLUTION_DUE", payload: { passId, rollEventId: `${passId}-roll-event` } },
  });
  return { ...rest, confirmed, rolled, resolved };
}

test("FREE_BALL_MOVED produces a deterministic MatchState transition and semantic event", () => {
  const state = matchState();
  const context = createMatchContext({ id: "context-1" });
  const first = applyGameCommand({ state, context, command: moveBallCommand() });
  const second = applyGameCommand({ state, context, command: moveBallCommand() });

  assert.deepEqual(first, second);
  assert.equal(first.accepted, true);
  assert.deepEqual(first.nextState.pieces.find(piece => piece.id === "ball"), { id: "ball", team: "BALL", x: 7, y: 8 });
  assert.deepEqual(state.pieces.find(piece => piece.id === "ball"), { id: "ball", team: "BALL", x: 4, y: 5 });
  assert.deepEqual(first.events, [{
    type: "BALL_MOVED",
    commandId: "cmd-free-ball-1",
    team: null,
    metadata: {
      pieceId: "ball",
      from: { x: 4, y: 5 },
      to: { x: 7, y: 8 },
      movementReason: "FREE_BALL",
    },
  }]);
  assert.deepEqual(first.timeline, { groupId: null, undoMode: "step", allowNoop: false });
});

test("rejected commands do not mutate MatchState", () => {
  const state = matchState();
  const before = structuredClone(state);
  const result = applyGameCommand({ state, context: {}, command: moveBallCommand({ payload: { x: 4.5, y: 8 } }) });

  assert.deepEqual(result, { accepted: false, reason: "BALL_DESTINATION_INVALID" });
  assert.deepEqual(state, before);
});

test("FREE_BALL_MOVED is unavailable outside Match Mode", () => {
  const state = createGameState({ ...matchState(), gameMode: "editor" });
  const result = applyGameCommand({ state, context: {}, command: moveBallCommand() });

  assert.deepEqual(result, { accepted: false, reason: "MATCH_MODE_REQUIRED" });
});

test("MatchContext is copied and frozen at creation", () => {
  const raw = {
    id: "context-1",
    boardSettings: { cols: 18 },
    gameplayCards: [{ id: "card-1", name: "Vale", passiveAttributes: [{ name: "Passing", value: 14 }] }],
  };
  const context = createMatchContext(raw);
  raw.boardSettings.cols = 99;
  raw.gameplayCards[0].passiveAttributes[0].value = 1;

  assert.equal(context.boardSettings.cols, 18);
  assert.equal(context.gameplayCardsById["card-1"].passiveAttributes[0].value, 14);
  assert.equal(Object.isFrozen(context), true);
  assert.equal(Object.isFrozen(context.gameplayCardsById["card-1"]), true);
});

test("MATCH_STARTED creates the canonical playable first turn and clears stale interaction state", () => {
  const start = createGameState({
    gameMode: "match",
    pieces: [{ id: "ball", team: "BALL", x: 4, y: 5 }],
    movementStateByPieceId: { "blue-1": { spent: 2 } },
    actionResolution: { id: "stale-pass", kind: "pass" },
    actionContinuation: { id: "stale-bonus", kind: "bonus-card-action", team: "blue", status: "ready" },
    tracker: {
      gameStarted: false,
      currentTurn: 0,
      usedActions: { blue: 3, red: 2 },
      actionLog: { blue: [{ id: "old", type: "MOVE" }], red: [] },
      matchActionState: { freeMode: { active: true, pieceId: "blue-1", team: "blue" } },
      turnPhase: "complete",
      settings: { attackActions: 5, defenseActions: 4, turns: 20 },
    },
  });
  const result = applyGameCommand({
    state: start,
    context: {},
    command: { id: "match-start-blue", type: "MATCH_STARTED", payload: { team: "blue" } },
  });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.tracker.gameStarted, true);
  assert.equal(result.nextState.tracker.startingTeam, "blue");
  assert.equal(result.nextState.tracker.currentTurn, 1);
  assert.equal(result.nextState.tracker.turnPhase, "attack");
  assert.deepEqual(result.nextState.tracker.usedActions, { red: 0, blue: 0 });
  assert.deepEqual(result.nextState.movementStateByPieceId, {});
  assert.equal(result.nextState.actionResolution, null);
  assert.equal(result.nextState.actionContinuation, null);
  assert.equal(result.events[0].type, "MATCH_STARTED");
  assert.deepEqual(result.events[0].metadata, { startingTeam: "blue", startedTurn: 1, restarted: false });
});

test("MATCH_RESTARTED restarts an existing Match without moving any board piece", () => {
  const start = normalMoveState({
    pieces: [
      { id: "ball", team: "BALL", x: 8, y: 5 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 8, y: 5 },
    ],
    movementStateByPieceId: { "blue-1": { axis: "horizontal", spent: 3, distance: 3 } },
    actionResolution: { id: "restart-pass", kind: "pass" },
    actionContinuation: { id: "restart-bonus", kind: "bonus-card-action", team: "blue", status: "ready" },
    tracker: {
      ...normalMoveState().tracker,
      currentTurn: 6,
      turnPhase: "defense",
      usedActions: { blue: 5, red: 2 },
      actionLog: { blue: [{ id: "a", type: "PASS" }], red: [{ id: "b", type: "MOVE" }] },
    },
  });
  const result = applyGameCommand({
    state: start,
    context: normalMoveContext(),
    command: { id: "match-restart-red", type: "MATCH_RESTARTED", payload: { team: "red" } },
  });
  assert.equal(result.accepted, true);
  assert.deepEqual(result.nextState.pieces, start.pieces);
  assert.equal(result.nextState.tracker.currentTurn, 1);
  assert.equal(result.nextState.tracker.startingTeam, "red");
  assert.equal(result.nextState.tracker.turnPhase, "attack");
  assert.deepEqual(result.nextState.tracker.usedActions, { red: 0, blue: 0 });
  assert.deepEqual(result.nextState.movementStateByPieceId, {});
  assert.equal(result.nextState.actionResolution, null);
  assert.equal(result.nextState.actionContinuation, null);
  assert.equal(result.events[0].type, "MATCH_STARTED");
  assert.equal(result.events[0].metadata.restarted, true);
});

test("MATCH_STARTED rejects invalid teams, editor mode, and a second start without mutating MatchState", () => {
  const start = createGameState({ ...matchState(), tracker: { gameStarted: false } });
  const before = structuredClone(start);
  assert.deepEqual(applyGameCommand({
    state: start, context: {}, command: { id: "match-start-invalid", type: "MATCH_STARTED", payload: { team: "green" } },
  }), { accepted: false, reason: "MATCH_START_TEAM_INVALID" });
  assert.deepEqual(start, before);
  assert.deepEqual(applyGameCommand({
    state: createGameState({ ...start, gameMode: "editor" }), context: {}, command: { id: "match-start-editor", type: "MATCH_STARTED", payload: { team: "blue" } },
  }), { accepted: false, reason: "MATCH_MODE_REQUIRED" });
  assert.deepEqual(applyGameCommand({
    state: normalMoveState(), context: {}, command: { id: "match-start-again", type: "MATCH_STARTED", payload: { team: "blue" } },
  }), { accepted: false, reason: "MATCH_ALREADY_STARTED" });
  assert.deepEqual(applyGameCommand({
    state: createGameState({ ...matchState(), tracker: { gameStarted: false } }), context: {}, command: { id: "match-restart-before-start", type: "MATCH_RESTARTED", payload: { team: "blue" } },
  }), { accepted: false, reason: "MATCH_NOT_STARTED" });
});

test("NORMAL_MOVE commands activate, cancel, and refund one Tracker action", () => {
  const start = normalMoveState();
  const activated = applyGameCommand({
    state: start,
    context: normalMoveContext(),
    command: normalMoveCommand("NORMAL_MOVE_STARTED", {}, "move-start-1"),
  });
  assert.equal(activated.accepted, true);
  assert.equal(activated.nextState.tracker.usedActions.blue, 1);
  assert.equal(activated.nextState.tracker.matchActionState.activeMovement.pieceId, "blue-1");

  const cancelled = applyGameCommand({
    state: activated.nextState,
    context: normalMoveContext(),
    command: normalMoveCommand("NORMAL_MOVE_CANCELLED", {}, "move-cancel-1"),
  });
  assert.equal(cancelled.accepted, true);
  assert.equal(cancelled.nextState.tracker.usedActions.blue, 0);
  assert.deepEqual(cancelled.nextState.tracker.actionLog.blue, []);
  assert.equal(cancelled.nextState.tracker.matchActionState.activeMovement.active, false);
});

test("NORMAL_MOVE_COMMITTED owns validation, movement, ball carry, and active-movement closure", () => {
  const start = normalMoveState();
  const activated = applyGameCommand({ state: start, context: normalMoveContext(), command: normalMoveCommand("NORMAL_MOVE_STARTED", {}, "move-start-2") });
  const committed = applyGameCommand({
    state: activated.nextState,
    context: normalMoveContext(),
    command: normalMoveCommand("NORMAL_MOVE_COMMITTED", { x: 5, y: 5 }, "move-commit-2"),
  });
  assert.equal(committed.accepted, true);
  assert.deepEqual(committed.nextState.pieces.find(piece => piece.id === "blue-1"), { id: "blue-1", team: "A", cardId: "card-blue-1", label: "Blue 1", x: 5, y: 5 });
  assert.deepEqual(committed.nextState.pieces.find(piece => piece.id === "ball"), { id: "ball", team: "BALL", x: 5, y: 5 });
  assert.deepEqual(committed.nextState.movementStateByPieceId["blue-1"], { axis: "horizontal", spent: 2, distance: 2, threeTwoUsed: false, movementEnded: false });
  assert.equal(committed.nextState.tracker.matchActionState.activeMovement.active, false);
  assert.equal(committed.events[0].type, "PIECE_MOVED");
});

test("NORMAL_MOVE authorization permits later segments without another Tracker action", () => {
  const start = normalMoveState();
  const activated = applyGameCommand({ state: start, context: normalMoveContext(), command: normalMoveCommand("NORMAL_MOVE_STARTED", {}, "move-start-progressive") });
  const first = applyGameCommand({ state: activated.nextState, context: normalMoveContext(), command: normalMoveCommand("NORMAL_MOVE_COMMITTED", { x: 4, y: 5 }, "move-first-progressive") });
  assert.equal(first.accepted, true);
  assert.equal(first.nextState.tracker.matchActionState.activeMovement.active, false);
  assert.equal(first.nextState.tracker.matchActionState.byPieceId["blue-1"].moveAuthorized, true);

  const second = applyGameCommand({ state: first.nextState, context: normalMoveContext(), command: normalMoveCommand("NORMAL_MOVE_COMMITTED", { x: 6, y: 5 }, "move-second-progressive") });
  assert.equal(second.accepted, true);
  assert.equal(second.nextState.tracker.usedActions.blue, 1);
  assert.equal(second.nextState.tracker.actionLog.blue.length, 1);
  assert.equal(second.nextState.pieces.find(piece => piece.id === "blue-1").x, 6);
  assert.equal(second.timeline.groupId, "move-start-progressive");

  const wrongAxis = applyGameCommand({ state: second.nextState, context: normalMoveContext(), command: normalMoveCommand("NORMAL_MOVE_COMMITTED", { x: 6, y: 6 }, "move-wrong-axis") });
  assert.deepEqual(wrongAxis, { accepted: false, reason: "axis" });

  const phaseEnded = createGameState({ ...second.nextState, tracker: { ...second.nextState.tracker, turnPhase: "defense" } });
  const afterPhaseEnd = applyGameCommand({ state: phaseEnded, context: normalMoveContext(), command: normalMoveCommand("NORMAL_MOVE_COMMITTED", { x: 7, y: 5 }, "move-after-phase-end") });
  assert.deepEqual(afterPhaseEnd, { accepted: false, reason: "wait-active-team" });
});

test("NORMAL_MOVE continues after its final paid Tracker action until End Turn", () => {
  const start = normalMoveState({
    tracker: {
      ...normalMoveState().tracker,
      settings: { attackActions: 1, defenseActions: 1, turns: 20 },
    },
  });
  const activated = applyGameCommand({ state: start, context: normalMoveContext(), command: normalMoveCommand("NORMAL_MOVE_STARTED", {}, "last-action-start") });
  assert.equal(activated.nextState.tracker.usedActions.blue, 1);
  const first = applyGameCommand({ state: activated.nextState, context: normalMoveContext(), command: normalMoveCommand("NORMAL_MOVE_COMMITTED", { x: 4, y: 5 }, "last-action-first") });
  const second = applyGameCommand({ state: first.nextState, context: normalMoveContext(), command: normalMoveCommand("NORMAL_MOVE_COMMITTED", { x: 6, y: 5 }, "last-action-second") });
  assert.equal(second.accepted, true);
  assert.equal(second.nextState.tracker.usedActions.blue, 1);
  assert.equal(second.nextState.pieces.find(piece => piece.id === "blue-1").x, 6);
});

test("NORMAL_MOVE rejects invalid moves without mutating canonical MatchState", () => {
  const start = normalMoveState();
  const activated = applyGameCommand({ state: start, context: normalMoveContext(), command: normalMoveCommand("NORMAL_MOVE_STARTED", {}, "move-start-3") });
  const before = structuredClone(activated.nextState);
  const rejected = applyGameCommand({
    state: activated.nextState,
    context: normalMoveContext(),
    command: normalMoveCommand("NORMAL_MOVE_COMMITTED", { x: 8, y: 6 }, "move-commit-3"),
  });
  assert.deepEqual(rejected, { accepted: false, reason: "mixed" });
  assert.deepEqual(activated.nextState, before);
});

test("NORMAL_MOVE_COMMITTED rejects a player blocking its horizontal or diagonal path", () => {
  const horizontal = createGameState({
    ...normalMoveState(),
    pieces: [
      { id: "ball", team: "BALL", x: 3, y: 5 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 3, y: 5 },
      { id: "red-1", team: "B", x: 5, y: 5 },
    ],
  });
  const started = applyGameCommand({ state: horizontal, context: normalMoveContext(), command: normalMoveCommand("NORMAL_MOVE_STARTED", {}, "path-start-horizontal") });
  assert.deepEqual(applyGameCommand({
    state: started.nextState,
    context: normalMoveContext(),
    command: normalMoveCommand("NORMAL_MOVE_COMMITTED", { x: 7, y: 5 }, "path-horizontal"),
  }), { accepted: false, reason: "path-blocked" });

  const diagonal = createGameState({
    ...normalMoveState(),
    pieces: [
      { id: "ball", team: "BALL", x: 3, y: 5 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 3, y: 5 },
      { id: "blue-2", team: "A", x: 4, y: 6 },
    ],
  });
  const diagonalStarted = applyGameCommand({ state: diagonal, context: normalMoveContext(), command: normalMoveCommand("NORMAL_MOVE_STARTED", {}, "path-start-diagonal") });
  assert.deepEqual(applyGameCommand({
    state: diagonalStarted.nextState,
    context: normalMoveContext(),
    command: normalMoveCommand("NORMAL_MOVE_COMMITTED", { x: 5, y: 7 }, "path-diagonal"),
  }), { accepted: false, reason: "path-blocked" });
});

test("THREE_TWO_MOVE_COMMITTED is a free active-phase action and preserves the ball position", () => {
  const start = createGameState({
    ...normalMoveState(),
    pieces: [
      { id: "ball", team: "BALL", x: 5, y: 5 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", label: "Blue 1", x: 2, y: 5 },
    ],
    tracker: {
      ...normalMoveState().tracker,
      usedActions: { blue: 5, red: 0 },
      actionLog: { blue: Array.from({ length: 5 }, (_, index) => ({ id: `action-${index}`, type: "PASS", pieceId: "blue-1" })), red: [] },
    },
  });
  const command = {
    id: "three-two-1",
    type: "THREE_TWO_MOVE_COMMITTED",
    payload: { pieceId: "blue-1", x: 5, y: 5 },
  };
  const result = applyGameCommand({ state: start, context: normalMoveContext(), command });

  assert.equal(result.accepted, true);
  assert.equal(result.nextState.tracker.usedActions.blue, 5);
  assert.equal(result.nextState.tracker.actionLog.blue.length, 5);
  assert.equal(result.nextState.pieces.find(piece => piece.id === "blue-1").x, 5);
  assert.equal(result.nextState.pieces.find(piece => piece.id === "ball").x, 5);
  assert.deepEqual(result.nextState.movementStateByPieceId["blue-1"], {
    axis: null, spent: 0, distance: 0, threeTwoUsed: true, movementEnded: false,
  });
  assert.equal(result.events[0].type, "THREE_TWO_MOVE");
  assert.equal(result.events[0].metadata.movementReason, "THREE_TWO");
});

test("THREE_TWO_MOVE remains available to the Bonus Action owner outside the Tracker phase", () => {
  const state = createGameState({
    gameMode: "match",
    pieces: [
      { id: "ball", team: "BALL", x: 5, y: 5 },
      { id: "red-1", team: "B", cardId: "card-red-1", x: 3, y: 5 },
    ],
    tracker: {
      gameStarted: true,
      startingTeam: "blue",
      currentTurn: 2,
      turnPhase: "attack",
      settings: { attackActions: 5, defenseActions: 4, turns: 20 },
    },
    actionContinuation: { id: "bonus-red", kind: "bonus-card-action", team: "red", status: "action-active", actionType: "MOVE", pieceId: "red-1" },
  });
  const context = createMatchContext({ gameplayCards: [{ id: "card-red-1", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 4 }] }] });
  const result = applyGameCommand({
    state,
    context,
    command: { id: "bonus-three-two", type: "THREE_TWO_MOVE_COMMITTED", payload: { pieceId: "red-1", x: 5, y: 5 } },
  });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.tracker.usedActions.red, 0);
  assert.equal(result.nextState.actionContinuation.id, "bonus-red");
});

test("Bonus Action locks unrelated Engine commands while retaining Three Two", () => {
  const state = createGameState({
    ...normalMoveState(),
    actionContinuation: { id: "bonus-blue", kind: "bonus-card-action", team: "blue", status: "ready" },
  });
  assert.deepEqual(applyGameCommand({
    state,
    context: normalMoveContext(),
    command: normalMoveCommand("NORMAL_MOVE_STARTED", {}, "blocked-by-bonus"),
  }), { accepted: false, reason: "BONUS_ACTION_ACTIVE" });
  assert.deepEqual(applyGameCommand({
    state,
    context: normalMoveContext(),
    command: moveBallCommand({ id: "bonus-free-ball", payload: { x: 7, y: 8 } }),
  }), { accepted: false, reason: "BONUS_ACTION_ACTIVE" });
  assert.deepEqual(applyGameCommand({
    state,
    context: normalMoveContext(),
    command: normalMoveCommand("FREE_MOVE_STARTED", {}, "bonus-free-move"),
  }), { accepted: false, reason: "BONUS_ACTION_ACTIVE" });
});

test("BONUS_MOVE is Engine-owned, never consumes Tracker, and may continue until End B.A.", () => {
  const start = normalMoveState({
    actionContinuation: {
      id: "bonus-move-1",
      kind: "bonus-card-action",
      team: "blue",
      status: "ready",
      source: "natural-20-interception",
      resumePolicy: { type: "advance-turn", team: "blue", nextTurn: 2 },
    },
  });
  const started = applyGameCommand({
    state: start,
    context: normalMoveContext(),
    command: normalMoveCommand("BONUS_MOVE_STARTED", {}, "bonus-move-start"),
  });
  assert.equal(started.accepted, true);
  assert.equal(started.nextState.actionContinuation.status, "action-active");
  assert.equal(started.nextState.actionContinuation.movementStarted, false);
  assert.equal(started.nextState.tracker.usedActions.blue, 0);

  const first = applyGameCommand({
    state: started.nextState,
    context: normalMoveContext(),
    command: normalMoveCommand("BONUS_MOVE_COMMITTED", { x: 5, y: 5 }, "bonus-move-first"),
  });
  assert.equal(first.accepted, true);
  assert.equal(first.nextState.pieces.find(piece => piece.id === "blue-1").x, 5);
  assert.equal(first.nextState.actionContinuation.movementStarted, true);
  assert.equal(first.nextState.tracker.usedActions.blue, 0);

  const second = applyGameCommand({
    state: first.nextState,
    context: normalMoveContext(),
    command: normalMoveCommand("BONUS_MOVE_COMMITTED", { x: 7, y: 5 }, "bonus-move-second"),
  });
  assert.equal(second.accepted, true);
  assert.equal(second.nextState.pieces.find(piece => piece.id === "blue-1").x, 7);
  assert.equal(second.nextState.movementStateByPieceId["blue-1"].spent, 4);
  assert.equal(second.nextState.tracker.usedActions.blue, 0);
});

test("BONUS_MOVE can cancel only before its first physical segment", () => {
  const ready = normalMoveState({
    actionContinuation: {
      id: "bonus-move-cancel",
      kind: "bonus-card-action",
      team: "blue",
      status: "ready",
      resumePolicy: { type: "advance-turn", team: "blue", nextTurn: 2 },
    },
  });
  const started = applyGameCommand({ state: ready, context: normalMoveContext(), command: normalMoveCommand("BONUS_MOVE_STARTED") });
  const cancelled = applyGameCommand({ state: started.nextState, context: normalMoveContext(), command: normalMoveCommand("BONUS_MOVE_CANCELLED") });
  assert.equal(cancelled.accepted, true);
  assert.equal(cancelled.nextState.actionContinuation.status, "ready");

  const moved = applyGameCommand({ state: started.nextState, context: normalMoveContext(), command: normalMoveCommand("BONUS_MOVE_COMMITTED", { x: 4, y: 5 }) });
  const rejected = applyGameCommand({ state: moved.nextState, context: normalMoveContext(), command: normalMoveCommand("BONUS_MOVE_CANCELLED") });
  assert.deepEqual(rejected, { accepted: false, reason: "BONUS_MOVE_NOT_CANCELLABLE" });
});

test("BONUS_ACTION_ENDED is Engine-owned, records decline semantics, and starts its canonical next turn", () => {
  const state = normalMoveState({
    movementStateByPieceId: { "blue-1": { axis: "horizontal", spent: 2, distance: 2 } },
    tracker: {
      ...normalMoveState().tracker,
      currentTurn: 1,
      turnPhase: "defense",
      usedActions: { blue: 3, red: 2 },
      actionLog: { blue: [{ id: "blue-pass", type: "PASS" }], red: [{ id: "red-intercept", type: "INTERCEPTION" }] },
    },
    actionContinuation: {
      id: "bonus-end-1",
      kind: "bonus-card-action",
      team: "red",
      status: "ready",
      resumePolicy: { type: "advance-turn", team: "red", nextTurn: 2, phase: "attack" },
    },
  });
  const result = applyGameCommand({
    state,
    context: normalMoveContext(),
    command: { id: "bonus-end-command", type: "BONUS_ACTION_ENDED", payload: { continuationId: "bonus-end-1" } },
  });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.actionContinuation, null);
  assert.equal(result.nextState.tracker.startingTeam, "red");
  assert.equal(result.nextState.tracker.currentTurn, 2);
  assert.equal(result.nextState.tracker.turnPhase, "attack");
  assert.deepEqual(result.nextState.tracker.usedActions, { red: 0, blue: 0 });
  assert.deepEqual(result.nextState.movementStateByPieceId, {});
  assert.equal(result.events[0].type, "BONUS_ACTION_DECLINED");
  assert.deepEqual(result.events[0].metadata.bonusAction, { used: false, declined: true, actionType: null, pieceId: null });
  assert.equal(result.events[0].metadata.startedTurn, 2);
  assert.deepEqual(result.timeline, { groupId: "bonus-end-1", undoMode: "atomic", allowNoop: false });
});

test("BONUS_ACTION_ENDED accepts an active partial Bonus MOVE and completes the match after the final numbered turn", () => {
  const state = normalMoveState({
    tracker: { ...normalMoveState().tracker, currentTurn: 20, settings: { attackActions: 5, defenseActions: 4, turns: 20 } },
    actionContinuation: {
      id: "bonus-end-final",
      kind: "bonus-card-action",
      team: "blue",
      status: "action-active",
      actionType: "MOVE",
      pieceId: "blue-1",
      movementStarted: true,
      resumePolicy: { type: "advance-turn", team: "blue", nextTurn: 21, phase: "attack" },
    },
  });
  const result = applyGameCommand({
    state,
    context: normalMoveContext(),
    command: { id: "bonus-end-final-command", type: "BONUS_ACTION_ENDED", payload: { continuationId: "bonus-end-final" } },
  });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.actionContinuation, null);
  assert.equal(result.nextState.tracker.currentTurn, 20);
  assert.equal(result.nextState.tracker.turnPhase, "complete");
  assert.equal(result.events[0].type, "BONUS_ACTION_ENDED");
  assert.equal(result.events[0].metadata.matchComplete, true);
  assert.equal(result.events[0].metadata.startedTurn, null);
});

test("BONUS_ACTION_ENDED resumes a declared phase without resetting its Tracker state", () => {
  const state = normalMoveState({
    tracker: { ...normalMoveState().tracker, turnPhase: "defense", usedActions: { blue: 2, red: 1 } },
    actionContinuation: {
      id: "bonus-resume",
      kind: "bonus-card-action",
      team: "red",
      status: "awaiting-end-bonus-action",
      actionType: "TACKLING",
      pieceId: "red-1",
      resumePolicy: { type: "resume-phase", team: "red", nextTurn: 1, phase: "defense" },
    },
  });
  const result = applyGameCommand({
    state,
    context: normalMoveContext(),
    command: { id: "bonus-resume-command", type: "BONUS_ACTION_ENDED", payload: { continuationId: "bonus-resume" } },
  });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.tracker.turnPhase, "defense");
  assert.deepEqual(result.nextState.tracker.usedActions, { blue: 2, red: 1 });
  assert.equal(result.events[0].metadata.nextPhase, "defense");
});

test("BONUS_ACTION_ENDED rejects stale or missing Bonus Action commands without mutating MatchState", () => {
  const state = normalMoveState({
    actionContinuation: { id: "bonus-current", kind: "bonus-card-action", team: "blue", status: "ready" },
  });
  const before = structuredClone(state);
  assert.deepEqual(applyGameCommand({
    state,
    context: normalMoveContext(),
    command: { id: "bonus-stale", type: "BONUS_ACTION_ENDED", payload: { continuationId: "wrong-id" } },
  }), { accepted: false, reason: "BONUS_ACTION_NOT_ACTIVE" });
  assert.deepEqual(state, before);
});

test("THREE_TWO_MOVE_COMMITTED rejects an occupied ball square, reuse, and inactive phase without mutation", () => {
  const base = createGameState({
    ...normalMoveState(),
    pieces: [
      { id: "ball", team: "BALL", x: 5, y: 5 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 2, y: 5 },
      { id: "red-1", team: "B", cardId: "card-blue-1", x: 5, y: 5 },
    ],
  });
  const command = { id: "three-two-rejected", type: "THREE_TWO_MOVE_COMMITTED", payload: { pieceId: "blue-1", x: 5, y: 5 } };
  const before = structuredClone(base);
  assert.deepEqual(applyGameCommand({ state: base, context: normalMoveContext(), command }), { accepted: false, reason: "occupied" });
  assert.deepEqual(base, before);

  const used = createGameState({
    ...base,
    pieces: base.pieces.filter(piece => piece.id !== "red-1"),
    movementStateByPieceId: { "blue-1": { threeTwoUsed: true } },
  });
  assert.deepEqual(applyGameCommand({ state: used, context: normalMoveContext(), command: { ...command, id: "three-two-used" } }), { accepted: false, reason: "used" });

  const inactive = createGameState({ ...used, movementStateByPieceId: {}, tracker: { ...used.tracker, turnPhase: "defense" } });
  assert.deepEqual(applyGameCommand({ state: inactive, context: normalMoveContext(), command: { ...command, id: "three-two-phase" } }), { accepted: false, reason: "wait-active-team" });
});

test("THREE_TWO_MOVE_COMMITTED rejects a player blocking the path to the ball", () => {
  const state = createGameState({
    ...normalMoveState(),
    pieces: [
      { id: "ball", team: "BALL", x: 5, y: 5 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 2, y: 5 },
      { id: "blue-2", team: "A", x: 3, y: 5 },
    ],
  });
  const before = structuredClone(state);
  assert.deepEqual(applyGameCommand({
    state,
    context: normalMoveContext(),
    command: { id: "three-two-path", type: "THREE_TWO_MOVE_COMMITTED", payload: { pieceId: "blue-1", x: 5, y: 5 } },
  }), { accepted: false, reason: "path-blocked" });
  assert.deepEqual(state, before);
});

test("engine modules do not depend on UI, Firebase, or browser APIs", () => {
  const moduleFiles = ["gameEngine.mjs", "gameCommands.mjs", "gameEvents.mjs", "matchContext.mjs", "matchLifecycleRules.mjs", "movementPathRules.mjs", "normalMoveRules.mjs", "threeTwoMoveRules.mjs", "freeMoveRules.mjs", "groupMoveRules.mjs", "bonusActionRules.mjs", "singlePlayerController.mjs"];
  const forbidden = /(?:from\s+["'](?:react|firebase\/|firebase)["']|\bwindow\b|\bdocument\b|\blocalStorage\b|\bsetTimeout\b|\bsetInterval\b|\bfetch\b|\bXMLHttpRequest\b)/;
  moduleFiles.forEach(file => {
    const source = fs.readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    assert.equal(forbidden.test(source), false, `${file} imports or uses a forbidden runtime dependency`);
  });
});

test("legacy authorization overrides remain outside the Phase 3 normal-MOVE engine interception", () => {
  const source = fs.readFileSync(new URL("../main.jsx", import.meta.url), "utf8");
  assert.match(source, /!useThreeTwo && !authorizationOverride && authorization\.mode === "normal"/);
});

test("FREE_MOVE commands are administrative, keep the ball fixed, and lock other Engine commands", () => {
  const start = createGameState({
    ...normalMoveState(),
    pieces: [
      { id: "ball", team: "BALL", x: 3, y: 5 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 3, y: 5 },
      { id: "red-1", team: "B", x: 9, y: 5 },
    ],
    movementStateByPieceId: { "blue-1": { axis: "horizontal", spent: 2, distance: 2 } },
  });
  const started = applyGameCommand({
    state: start, context: normalMoveContext(),
    command: { id: "free-start", type: "FREE_MOVE_STARTED", payload: { pieceId: "blue-1" } },
  });
  assert.equal(started.accepted, true);
  assert.equal(started.nextState.tracker.matchActionState.freeMode.active, true);
  assert.equal(started.nextState.tracker.usedActions.blue, 0);
  assert.equal(started.events[0].metadata.administrative, true);
  assert.deepEqual(applyGameCommand({
    state: started.nextState, context: normalMoveContext(),
    command: normalMoveCommand("NORMAL_MOVE_STARTED", {}, "blocked-by-free"),
  }), { accepted: false, reason: "FREE_MOVE_ACTIVE" });

  const moved = applyGameCommand({
    state: started.nextState, context: normalMoveContext(),
    command: { id: "free-commit", type: "FREE_MOVE_COMMITTED", payload: { pieceId: "blue-1", x: 20, y: 17 } },
  });
  assert.equal(moved.accepted, true);
  assert.deepEqual(moved.nextState.pieces.find(piece => piece.id === "blue-1").x, 20);
  assert.deepEqual(moved.nextState.pieces.find(piece => piece.id === "ball"), { id: "ball", team: "BALL", x: 3, y: 5 });
  assert.deepEqual(moved.nextState.movementStateByPieceId, start.movementStateByPieceId);
  assert.equal(moved.events[0].metadata.movementReason, "FREE_MODE");
  assert.equal(moved.events[0].metadata.administrative, true);

  const ended = applyGameCommand({
    state: moved.nextState, context: normalMoveContext(),
    command: { id: "free-end", type: "FREE_MOVE_ENDED", payload: { pieceId: "blue-1" } },
  });
  assert.equal(ended.accepted, true);
  assert.equal(ended.nextState.tracker.matchActionState.freeMode.active, false);
});

test("FREE_MOVE permits the ball square but rejects a second player destination", () => {
  const start = createGameState({
    ...normalMoveState(),
    pieces: [
      { id: "ball", team: "BALL", x: 7, y: 7 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 2, y: 2 },
      { id: "red-1", team: "B", x: 8, y: 8 },
    ],
  });
  const started = applyGameCommand({ state: start, context: normalMoveContext(), command: { id: "free-start-ball", type: "FREE_MOVE_STARTED", payload: { pieceId: "blue-1" } } });
  const ballSquare = applyGameCommand({ state: started.nextState, context: normalMoveContext(), command: { id: "free-ball-square", type: "FREE_MOVE_COMMITTED", payload: { pieceId: "blue-1", x: 7, y: 7 } } });
  assert.equal(ballSquare.accepted, true);
  assert.equal(ballSquare.nextState.pieces.find(piece => piece.id === "ball").x, 7);
  assert.deepEqual(applyGameCommand({
    state: ballSquare.nextState, context: normalMoveContext(),
    command: { id: "free-occupied", type: "FREE_MOVE_COMMITTED", payload: { pieceId: "blue-1", x: 8, y: 8 } },
  }), { accepted: false, reason: "occupied" });
});

test("GROUP_MOVE confirms a zone only as the final action and then moves eligible players through blockers", () => {
  const start = createGameState({
    ...normalMoveState(),
    pieces: [
      { id: "ball", team: "BALL", x: 14, y: 5 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 4, y: 5 },
      { id: "blue-2", team: "A", cardId: "card-blue-1", x: 5, y: 6 },
      { id: "red-blocker", team: "B", x: 6, y: 5 },
    ],
    tracker: {
      ...normalMoveState().tracker,
      usedActions: { blue: 4, red: 0 },
      actionLog: { blue: Array.from({ length: 4 }, (_, index) => ({ id: `action-${index}`, type: "PASS", pieceId: "blue-1" })), red: [] },
    },
  });
  const context = createMatchContext({ ...normalMoveContext(), boardSettings: { cols: 20, rows: 12 }, ruleSet: { actions: { groupMove: { maxPlayers: 2, zoneLength: 5, maxDistance: 6, sameDirectionOnly: true } } } });
  const confirmed = applyGameCommand({
    state: start, context,
    command: { id: "group-zone", type: "GROUP_MOVE_ZONE_CONFIRMED", payload: { team: "blue", zoneStartX: 3 } },
  });
  assert.equal(confirmed.accepted, true);
  assert.equal(confirmed.nextState.tracker.usedActions.blue, 5);
  assert.deepEqual(confirmed.nextState.tracker.matchActionState.groupMove.movedPieceIds, []);
  assert.equal(confirmed.events[0].type, "GROUP_MOVE_ACTIVATED");
  assert.deepEqual(applyGameCommand({
    state: confirmed.nextState, context,
    command: normalMoveCommand("NORMAL_MOVE_STARTED", {}, "blocked-by-group"),
  }), { accepted: false, reason: "GROUP_MOVE_ACTIVE" });
  const first = applyGameCommand({
    state: confirmed.nextState, context,
    command: { id: "group-first", type: "GROUP_MOVE_PLAYER_COMMITTED", payload: { pieceId: "blue-1", x: 8, y: 5 } },
  });
  assert.equal(first.accepted, true);
  assert.equal(first.nextState.pieces.find(piece => piece.id === "blue-1").x, 8);
  assert.equal(first.events[0].type, "GROUP_MOVE_PIECE");
  assert.deepEqual(first.nextState.tracker.matchActionState.groupMove.direction, { orientation: "horizontal", dx: 1, dy: 0 });
  const second = applyGameCommand({
    state: first.nextState, context,
    command: { id: "group-second", type: "GROUP_MOVE_PLAYER_COMMITTED", payload: { pieceId: "blue-2", x: 9, y: 6 } },
  });
  assert.equal(second.accepted, true);
  assert.equal(second.nextState.tracker.matchActionState.groupMove.movedPieceIds.length, 2);
});

test("GROUP_MOVE preview evaluator uses the Engine rule and permits crossing a blocker", () => {
  const start = createGameState({
    ...normalMoveState(),
    pieces: [
      { id: "ball", team: "BALL", x: 14, y: 5 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 4, y: 5 },
      { id: "blue-moved", team: "A", cardId: "card-blue-1", x: 5, y: 6 },
      { id: "red-blocker", team: "B", x: 6, y: 5 },
    ],
    movementStateByPieceId: { "blue-moved": { spent: 1, distance: 1 } },
    tracker: {
      ...normalMoveState().tracker,
      usedActions: { blue: 4, red: 0 },
      actionLog: { blue: Array.from({ length: 4 }, (_, index) => ({ id: `action-${index}`, type: "PASS" })), red: [] },
    },
  });
  const context = createMatchContext({ boardSettings: { cols: 20, rows: 12 }, ruleSet: { actions: { groupMove: { maxPlayers: 4, zoneLength: 5, maxDistance: 6, sameDirectionOnly: true } } } });
  const active = applyGameCommand({ state: start, context, command: { id: "group-zone-preview", type: "GROUP_MOVE_ZONE_CONFIRMED", payload: { team: "blue", zoneStartX: 3 } } });
  const before = structuredClone(active.nextState);
  const eligible = evaluateGroupMovePieceEligibility(active.nextState, { payload: { pieceId: "blue-1" } });
  const alreadyMoved = evaluateGroupMovePieceEligibility(active.nextState, { payload: { pieceId: "blue-moved" } });
  const preview = evaluateGroupMovePlayer(active.nextState, context, { payload: { pieceId: "blue-1", x: 8, y: 5 } });

  assert.equal(eligible.accepted, true);
  assert.deepEqual(alreadyMoved, { accepted: false, reason: "GROUP_MOVE_PIECE_ALREADY_MOVED" });
  assert.equal(preview.accepted, true);
  assert.equal(preview.geometry.distance, 4);
  assert.deepEqual(active.nextState, before);
});

test("GROUP_MOVE rejects unconfirmed, moved, outside-zone, ball, occupied, distance, and wrong-direction destinations", () => {
  const start = createGameState({
    ...normalMoveState(),
    pieces: [
      { id: "ball", team: "BALL", x: 8, y: 5 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 3, y: 5 },
      { id: "blue-2", team: "A", cardId: "card-blue-1", x: 4, y: 6 },
      { id: "blue-moved", team: "A", cardId: "card-blue-1", x: 5, y: 4 },
      { id: "red-1", team: "B", x: 7, y: 5 },
    ],
    movementStateByPieceId: { "blue-moved": { spent: 1, distance: 1 } },
    tracker: { ...normalMoveState().tracker, usedActions: { blue: 4, red: 0 }, actionLog: { blue: Array.from({ length: 4 }, (_, index) => ({ id: `a-${index}`, type: "PASS" })), red: [] } },
  });
  const context = createMatchContext({ boardSettings: { cols: 20, rows: 12 }, ruleSet: { actions: { groupMove: { maxPlayers: 1, zoneLength: 4, maxDistance: 3, sameDirectionOnly: true } } } });
  assert.deepEqual(applyGameCommand({ state: start, context, command: { id: "unconfirmed", type: "GROUP_MOVE_PLAYER_COMMITTED", payload: { pieceId: "blue-1", x: 4, y: 5 } } }), { accepted: false, reason: "GROUP_MOVE_NOT_ACTIVE" });
  const active = applyGameCommand({ state: start, context, command: { id: "zone", type: "GROUP_MOVE_ZONE_CONFIRMED", payload: { team: "blue", zoneStartX: 3 } } });
  assert.deepEqual(applyGameCommand({ state: active.nextState, context, command: { id: "moved", type: "GROUP_MOVE_PLAYER_COMMITTED", payload: { pieceId: "blue-moved", x: 6, y: 4 } } }), { accepted: false, reason: "GROUP_MOVE_PIECE_ALREADY_MOVED" });
  const carrierState = createGameState({ ...active.nextState, pieces: active.nextState.pieces.map(piece => piece.id === "ball" ? { ...piece, x: 3, y: 5 } : piece) });
  assert.deepEqual(applyGameCommand({ state: carrierState, context, command: { id: "carrier", type: "GROUP_MOVE_PLAYER_COMMITTED", payload: { pieceId: "blue-1", x: 6, y: 5 } } }), { accepted: false, reason: "GROUP_MOVE_PIECE_HAS_BALL" });
  assert.deepEqual(applyGameCommand({ state: active.nextState, context, command: { id: "ball", type: "GROUP_MOVE_PLAYER_COMMITTED", payload: { pieceId: "blue-1", x: 8, y: 5 } } }), { accepted: false, reason: "GROUP_MOVE_BALL_DESTINATION" });
  assert.deepEqual(applyGameCommand({ state: active.nextState, context, command: { id: "occupied", type: "GROUP_MOVE_PLAYER_COMMITTED", payload: { pieceId: "blue-1", x: 7, y: 5 } } }), { accepted: false, reason: "occupied" });
  assert.deepEqual(applyGameCommand({ state: active.nextState, context, command: { id: "far", type: "GROUP_MOVE_PLAYER_COMMITTED", payload: { pieceId: "blue-1", x: 7, y: 5 } } }), { accepted: false, reason: "occupied" });
  const first = applyGameCommand({ state: active.nextState, context, command: { id: "first", type: "GROUP_MOVE_PLAYER_COMMITTED", payload: { pieceId: "blue-1", x: 6, y: 5 } } });
  assert.deepEqual(applyGameCommand({ state: first.nextState, context, command: { id: "direction", type: "GROUP_MOVE_PLAYER_COMMITTED", payload: { pieceId: "blue-2", x: 4, y: 3 } } }), { accepted: false, reason: "GROUP_MOVE_LIMIT_REACHED" });
});

test("TRACKER_PHASE_ENDED advances defense automatically and resets only the new numbered turn", () => {
  const attack = normalMoveState({
    movementStateByPieceId: { "blue-1": { axis: "horizontal", spent: 2, distance: 2 } },
    tracker: {
      ...normalMoveState().tracker,
      matchActionState: { groupMove: { active: true, team: "blue", timelineGroupId: "group-1" } },
      usedActions: { blue: 2, red: 0 },
      actionLog: { blue: [{ id: "a-1", type: "MOVE", pieceId: "blue-1" }, { id: "a-2", type: "PASS", pieceId: "blue-1" }], red: [] },
    },
  });
  const attackEnded = applyGameCommand({ state: attack, context: normalMoveContext(), command: { id: "phase-blue", type: "TRACKER_PHASE_ENDED", payload: { team: "blue" } } });
  assert.equal(attackEnded.accepted, true);
  assert.equal(attackEnded.nextState.tracker.turnPhase, "defense");
  assert.equal(attackEnded.nextState.tracker.currentTurn, 1);
  assert.equal(attackEnded.nextState.tracker.usedActions.blue, 2);
  assert.equal(attackEnded.nextState.movementStateByPieceId["blue-1"].spent, 2);
  assert.equal(attackEnded.nextState.tracker.matchActionState.groupMove.active, false);

  const defenseEnded = applyGameCommand({ state: attackEnded.nextState, context: normalMoveContext(), command: { id: "phase-red", type: "TRACKER_PHASE_ENDED", payload: { team: "red" } } });
  assert.equal(defenseEnded.accepted, true);
  assert.equal(defenseEnded.nextState.tracker.currentTurn, 2);
  assert.equal(defenseEnded.nextState.tracker.turnPhase, "attack");
  assert.deepEqual(defenseEnded.nextState.tracker.usedActions, { red: 0, blue: 0 });
  assert.deepEqual(defenseEnded.nextState.movementStateByPieceId, {});
  assert.equal(defenseEnded.events[0].metadata.startedTurn, 2);
});

test("TRACKER_PHASE_ENDED completes the last defense without inventing another turn", () => {
  const finalDefense = normalMoveState({
    tracker: { ...normalMoveState().tracker, currentTurn: 20, turnPhase: "defense" },
  });
  const result = applyGameCommand({ state: finalDefense, context: normalMoveContext(), command: { id: "phase-final", type: "TRACKER_PHASE_ENDED", payload: { team: "red" } } });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.tracker.currentTurn, 20);
  assert.equal(result.nextState.tracker.turnPhase, "complete");
  assert.equal(result.events[0].metadata.startedTurn, null);
});

test("a pre-movement normal MOVE locks every Engine command except commit or cancel", () => {
  const started = applyGameCommand({ state: normalMoveState(), context: normalMoveContext(), command: normalMoveCommand("NORMAL_MOVE_STARTED", {}, "move-lock-start") });
  const phase = applyGameCommand({ state: started.nextState, context: normalMoveContext(), command: { id: "move-lock-phase", type: "TRACKER_PHASE_ENDED", payload: { team: "blue" } } });
  const free = applyGameCommand({ state: started.nextState, context: normalMoveContext(), command: normalMoveCommand("FREE_MOVE_STARTED", {}, "move-lock-free") });
  assert.deepEqual(phase, { accepted: false, reason: "MOVE_INTERACTION_ACTIVE" });
  assert.deepEqual(free, { accepted: false, reason: "MOVE_INTERACTION_ACTIVE" });
  const cancelled = applyGameCommand({ state: started.nextState, context: normalMoveContext(), command: normalMoveCommand("NORMAL_MOVE_CANCELLED", {}, "move-lock-cancel") });
  assert.equal(cancelled.accepted, true);
  assert.equal(cancelled.nextState.tracker.usedActions.blue, 0);
});

test("PASS_STARTED creates canonical targeting without consuming Tracker, and PASS_CANCELLED restores the normal action state", () => {
  const start = normalMoveState();
  const started = applyGameCommand({
    state: start,
    context: normalMoveContext(),
    command: { id: "pass-start", type: "PASS_STARTED", payload: { pieceId: "blue-1", passId: "pass-1" } },
  });
  assert.equal(started.accepted, true);
  assert.equal(started.nextState.actionResolution.id, "pass-1");
  assert.equal(started.nextState.actionResolution.status, "targeting");
  assert.equal(started.nextState.tracker.usedActions.blue, 0);
  assert.equal(started.events[0].type, "PASS_TARGETING_STARTED");
  assert.deepEqual(applyGameCommand({
    state: started.nextState,
    context: normalMoveContext(),
    command: normalMoveCommand("NORMAL_MOVE_STARTED", {}, "blocked-by-pass-targeting"),
  }), { accepted: false, reason: "ACTION_RESOLUTION_ACTIVE" });
  const cancelled = applyGameCommand({
    state: started.nextState,
    context: normalMoveContext(),
    command: { id: "pass-cancel", type: "PASS_CANCELLED", payload: { passId: "pass-1" } },
  });
  assert.equal(cancelled.accepted, true);
  assert.equal(cancelled.nextState.actionResolution, null);
  assert.equal(cancelled.nextState.tracker.usedActions.blue, 0);
  assert.equal(cancelled.events[0].type, "PASS_CANCELLED");
});

test("PASS_STARTED and PASS_CANCELLED preserve a ready Bonus Action without touching Tracker", () => {
  const start = createGameState({
    ...normalMoveState(),
    actionContinuation: {
      id: "bonus-pass-1",
      kind: "bonus-card-action",
      team: "blue",
      status: "ready",
      resumePolicy: { type: "resume-phase", team: "blue", phase: "attack" },
    },
  });
  const started = applyGameCommand({
    state: start,
    context: normalMoveContext(),
    command: { id: "bonus-pass-start", type: "PASS_STARTED", payload: { pieceId: "blue-1", passId: "bonus-pass-targeting" } },
  });
  assert.equal(started.accepted, true);
  assert.equal(started.events[0].type, "BONUS_PASS_TARGETING_STARTED");
  assert.equal(started.nextState.actionContinuation.status, "action-active");
  assert.equal(started.nextState.actionContinuation.actionType, "PASS");
  assert.equal(started.nextState.actionResolution.continuationId, "bonus-pass-1");
  assert.equal(started.nextState.tracker.usedActions.blue, 0);
  const cancelled = applyGameCommand({
    state: started.nextState,
    context: normalMoveContext(),
    command: { id: "bonus-pass-cancel", type: "PASS_CANCELLED", payload: { passId: "bonus-pass-targeting" } },
  });
  assert.equal(cancelled.accepted, true);
  assert.equal(cancelled.nextState.actionResolution, null);
  assert.equal(cancelled.nextState.actionContinuation.status, "ready");
  assert.equal(cancelled.nextState.actionContinuation.actionType, null);
  assert.equal(cancelled.nextState.tracker.usedActions.blue, 0);
  const move = applyGameCommand({
    state: cancelled.nextState,
    context: normalMoveContext(),
    command: normalMoveCommand("BONUS_MOVE_STARTED", {}, "bonus-move-after-pass-cancel"),
  });
  assert.equal(move.accepted, true);
});

test("PASS_TARGET_SELECTED is canonical, keeps an occupied target legal, and does not consume Tracker", () => {
  const start = createGameState({
    ...normalMoveState(),
    pieces: [
      { id: "ball", team: "BALL", x: 3, y: 5 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 3, y: 5 },
      { id: "red-on-target", team: "B", x: 9, y: 7 },
    ],
  });
  const started = applyGameCommand({
    state: start, context: normalMoveContext(),
    command: { id: "pass-target-start", type: "PASS_STARTED", payload: { pieceId: "blue-1", passId: "pass-target-1" } },
  });
  const selected = applyGameCommand({
    state: started.nextState, context: normalMoveContext(),
    command: { id: "pass-target-select", type: "PASS_TARGET_SELECTED", payload: { passId: "pass-target-1", x: 9, y: 7 } },
  });
  assert.equal(selected.accepted, true);
  assert.equal(selected.nextState.actionResolution.status, "route-selection");
  assert.deepEqual(selected.nextState.actionResolution.target, { x: 9, y: 7 });
  assert.equal(selected.nextState.actionResolution.plan, undefined);
  assert.equal(selected.nextState.tracker.usedActions.blue, 0);
  assert.equal(selected.events[0].type, "PASS_TARGET_SELECTED");
});

test("PASS_TARGET_SELECTED rejects stale, non-integer, and out-of-bounds targets without mutation", () => {
  const started = applyGameCommand({
    state: normalMoveState(), context: normalMoveContext(),
    command: { id: "pass-target-reject-start", type: "PASS_STARTED", payload: { pieceId: "blue-1", passId: "pass-target-reject" } },
  });
  for (const [command, reason] of [
    [{ id: "pass-target-wrong-id", type: "PASS_TARGET_SELECTED", payload: { passId: "other", x: 5, y: 5 } }, "PASS_NOT_TARGETING"],
    [{ id: "pass-target-fraction", type: "PASS_TARGET_SELECTED", payload: { passId: "pass-target-reject", x: 5.5, y: 5 } }, "PASS_TARGET_INVALID"],
    [{ id: "pass-target-off-board", type: "PASS_TARGET_SELECTED", payload: { passId: "pass-target-reject", x: 20, y: 5 } }, "PASS_TARGET_OUT_OF_BOUNDS"],
  ]) {
    const before = structuredClone(started.nextState);
    assert.deepEqual(applyGameCommand({ state: started.nextState, context: normalMoveContext(), command }), { accepted: false, reason });
    assert.deepEqual(started.nextState, before);
  }
});

test("PASS_TARGET_SELECTED remains in the atomic Bonus Pass transaction without touching Tracker", () => {
  const start = createGameState({
    ...normalMoveState(),
    actionContinuation: { id: "bonus-target", kind: "bonus-card-action", team: "blue", status: "ready", resumePolicy: { type: "resume-phase", team: "blue", phase: "attack" } },
  });
  const started = applyGameCommand({
    state: start, context: normalMoveContext(),
    command: { id: "bonus-target-start", type: "PASS_STARTED", payload: { pieceId: "blue-1", passId: "bonus-target-pass" } },
  });
  const selected = applyGameCommand({
    state: started.nextState, context: normalMoveContext(),
    command: { id: "bonus-target-select", type: "PASS_TARGET_SELECTED", payload: { passId: "bonus-target-pass", x: 7, y: 5 } },
  });
  assert.equal(selected.accepted, true);
  assert.equal(selected.timeline.groupId, "bonus-target");
  assert.equal(selected.nextState.tracker.usedActions.blue, 0);
  assert.equal(selected.nextState.actionContinuation.status, "action-active");
});

test("PASS_ROUTE_CONFIRMED creates the canonical plan and consumes exactly one normal Tracker action", () => {
  const started = applyGameCommand({
    state: normalMoveState(), context: normalMoveContext(),
    command: { id: "route-start", type: "PASS_STARTED", payload: { pieceId: "blue-1", passId: "route-pass" } },
  });
  const targeted = applyGameCommand({
    state: started.nextState, context: normalMoveContext(),
    command: { id: "route-target", type: "PASS_TARGET_SELECTED", payload: { passId: "route-pass", x: 9, y: 5 } },
  });
  const confirmed = applyGameCommand({
    state: targeted.nextState, context: normalMoveContext(),
    command: { id: "route-confirm", type: "PASS_ROUTE_CONFIRMED", payload: { passId: "route-pass", cornerId: "top-left" } },
  });
  assert.equal(confirmed.accepted, true);
  assert.equal(confirmed.events[0].type, "PASS_CONFIRMED");
  assert.equal(confirmed.nextState.tracker.usedActions.blue, 1);
  assert.equal(confirmed.nextState.tracker.actionLog.blue[0].type, "PASS");
  assert.equal(confirmed.nextState.actionResolution.status, "completing");
  assert.equal(confirmed.nextState.actionResolution.cornerId, "top-left");
  assert.deepEqual(confirmed.nextState.actionResolution.plan.requestedTarget, { x: 9, y: 5 });
  assert.equal(confirmed.nextState.actionResolution.plan.passerPass, 13);
  assert.equal(confirmed.nextState.pieces.find(piece => piece.id === "ball").x, 3);
});

test("PASS_ROUTE_CONFIRMED rejects an invalid route and a blocked origin without consuming Tracker", () => {
  const routeSelection = applyGameCommand({
    state: applyGameCommand({
      state: normalMoveState(), context: normalMoveContext(),
      command: { id: "route-invalid-start", type: "PASS_STARTED", payload: { pieceId: "blue-1", passId: "route-invalid" } },
    }).nextState,
    context: normalMoveContext(),
    command: { id: "route-invalid-target", type: "PASS_TARGET_SELECTED", payload: { passId: "route-invalid", x: 9, y: 5 } },
  });
  const invalidBefore = structuredClone(routeSelection.nextState);
  assert.deepEqual(applyGameCommand({
    state: routeSelection.nextState, context: normalMoveContext(),
    command: { id: "route-invalid-confirm", type: "PASS_ROUTE_CONFIRMED", payload: { passId: "route-invalid", cornerId: "unknown" } },
  }), { accepted: false, reason: "PASS_ROUTE_INVALID" });
  assert.deepEqual(routeSelection.nextState, invalidBefore);

  const blockedState = createGameState({
    ...routeSelection.nextState,
    pieces: [...routeSelection.nextState.pieces, { id: "red-origin-blocker", team: "B", x: 2, y: 4 }],
  });
  const blockedBefore = structuredClone(blockedState);
  assert.deepEqual(applyGameCommand({
    state: blockedState, context: normalMoveContext(),
    command: { id: "route-blocked-confirm", type: "PASS_ROUTE_CONFIRMED", payload: { passId: "route-invalid", cornerId: "top-left" } },
  }), { accepted: false, reason: "PASS_ROUTE_ORIGIN_BLOCKED" });
  assert.deepEqual(blockedState, blockedBefore);
});

test("PASS_ROUTE_CONFIRMED rejects a goalkeeper-blocked route without consuming Tracker", () => {
  const routeSelection = applyGameCommand({
    state: applyGameCommand({
      state: normalMoveState(), context: normalMoveContext(),
      command: { id: "gk-route-start", type: "PASS_STARTED", payload: { pieceId: "blue-1", passId: "gk-route" } },
    }).nextState,
    context: normalMoveContext(),
    command: { id: "gk-route-target", type: "PASS_TARGET_SELECTED", payload: { passId: "gk-route", x: 9, y: 5 } },
  });
  const goalkeeperState = createGameState({
    ...routeSelection.nextState,
    pieces: [...routeSelection.nextState.pieces, { id: "red-gk", team: "B", cardId: "card-red-gk", x: 5, y: 5 }],
  });
  const goalkeeperContext = createMatchContext({
    id: "goalkeeper-route-context",
    boardSettings: normalMoveContext().boardSettings,
    gameplayCardsById: {
      ...normalMoveContext().gameplayCardsById,
      "card-red-gk": { id: "card-red-gk", position: "GK" },
    },
  });
  const before = structuredClone(goalkeeperState);
  assert.deepEqual(applyGameCommand({
    state: goalkeeperState, context: goalkeeperContext,
    command: { id: "gk-route-confirm", type: "PASS_ROUTE_CONFIRMED", payload: { passId: "gk-route", cornerId: "top-left" } },
  }), { accepted: false, reason: "PASS_ROUTE_GOALKEEPER_BLOCKED" });
  assert.deepEqual(goalkeeperState, before);
});

test("PASS_ROUTE_CONFIRMED enters the existing pending roll or interceptor-choice state without resolving a Pass", () => {
  const rollState = createGameState({
    ...normalMoveState(),
    pieces: [...normalMoveState().pieces, { id: "red-1", team: "B", cardId: "card-red-1", x: 5, y: 7 }],
  });
  const rollStarted = applyGameCommand({ state: rollState, context: normalMoveContext(), command: { id: "route-roll-start", type: "PASS_STARTED", payload: { pieceId: "blue-1", passId: "route-roll" } } });
  const rollTargeted = applyGameCommand({ state: rollStarted.nextState, context: normalMoveContext(), command: { id: "route-roll-target", type: "PASS_TARGET_SELECTED", payload: { passId: "route-roll", x: 9, y: 5 } } });
  const rollConfirmed = applyGameCommand({ state: rollTargeted.nextState, context: normalMoveContext(), command: { id: "route-roll-confirm", type: "PASS_ROUTE_CONFIRMED", payload: { passId: "route-roll", cornerId: "top-left" } } });
  assert.equal(rollConfirmed.nextState.actionResolution.status, "awaiting-interception-roll");
  assert.equal(rollConfirmed.nextState.actionResolution.pendingRoll.subjectId, "red-1");
  assert.equal(rollConfirmed.nextState.pieces.find(piece => piece.id === "ball").x, 3);

  const choiceState = createGameState({
    ...normalMoveState(),
    pieces: [...normalMoveState().pieces,
      { id: "red-1", team: "B", cardId: "card-red-1", x: 5, y: 7 },
      { id: "red-2", team: "B", cardId: "card-red-2", x: 5, y: 3 },
    ],
  });
  const choiceStarted = applyGameCommand({ state: choiceState, context: normalMoveContext(), command: { id: "route-choice-start", type: "PASS_STARTED", payload: { pieceId: "blue-1", passId: "route-choice" } } });
  const choiceTargeted = applyGameCommand({ state: choiceStarted.nextState, context: normalMoveContext(), command: { id: "route-choice-target", type: "PASS_TARGET_SELECTED", payload: { passId: "route-choice", x: 9, y: 5 } } });
  const choiceConfirmed = applyGameCommand({ state: choiceTargeted.nextState, context: normalMoveContext(), command: { id: "route-choice-confirm", type: "PASS_ROUTE_CONFIRMED", payload: { passId: "route-choice", cornerId: "top-left" } } });
  assert.equal(choiceConfirmed.nextState.actionResolution.status, "awaiting-interceptor-choice");
  assert.deepEqual(choiceConfirmed.nextState.actionResolution.pendingDecision.options.map(option => option.defenderId).sort(), ["red-1", "red-2"]);
});

test("PASS_INTERCEPTOR_SELECTED reorders the canonical plan and creates the selected defender roll", () => {
  const choiceState = createGameState({
    ...normalMoveState(),
    pieces: [...normalMoveState().pieces,
      { id: "red-1", team: "B", cardId: "card-red-1", x: 5, y: 7 },
      { id: "red-2", team: "B", cardId: "card-red-2", x: 5, y: 3 },
    ],
  });
  const started = applyGameCommand({ state: choiceState, context: normalMoveContext(), command: { id: "interceptor-start", type: "PASS_STARTED", payload: { pieceId: "blue-1", passId: "interceptor-pass" } } });
  const targeted = applyGameCommand({ state: started.nextState, context: normalMoveContext(), command: { id: "interceptor-target", type: "PASS_TARGET_SELECTED", payload: { passId: "interceptor-pass", x: 9, y: 5 } } });
  const route = applyGameCommand({ state: targeted.nextState, context: normalMoveContext(), command: { id: "interceptor-route", type: "PASS_ROUTE_CONFIRMED", payload: { passId: "interceptor-pass", cornerId: "top-left" } } });
  const before = structuredClone(route.nextState);
  const result = applyGameCommand({
    state: route.nextState, context: normalMoveContext(),
    command: { id: "interceptor-choice", type: "PASS_INTERCEPTOR_SELECTED", payload: { passId: "interceptor-pass", decisionId: route.nextState.actionResolution.pendingDecision.id, pieceId: "red-2" } },
  });
  assert.equal(result.accepted, true);
  assert.equal(result.events[0].type, "PASS_INTERCEPTOR_SELECTED");
  assert.equal(result.nextState.actionResolution.status, "awaiting-interception-roll");
  assert.equal(result.nextState.actionResolution.pendingDecision, null);
  assert.equal(result.nextState.actionResolution.pendingRoll.subjectId, "red-2");
  assert.deepEqual(result.nextState.actionResolution.plan.interceptors.map(item => item.defender.id), ["red-2", "red-1"]);
  assert.deepEqual(result.nextState.actionResolution.plan.interceptors.map(item => item.orderModifier), [0, 1]);
  assert.equal(result.nextState.actionResolution.plan.interceptorPriority.selections[0].selectedPieceId, "red-2");
  assert.deepEqual(result.nextState.tracker.usedActions, before.tracker.usedActions);
  assert.deepEqual(result.nextState.pieces, before.pieces);
});

test("PASS_INTERCEPTOR_SELECTED rejects stale decisions and invalid defenders without mutation", () => {
  const choiceState = createGameState({
    ...normalMoveState(),
    pieces: [...normalMoveState().pieces,
      { id: "red-1", team: "B", cardId: "card-red-1", x: 5, y: 7 },
      { id: "red-2", team: "B", cardId: "card-red-2", x: 5, y: 3 },
    ],
  });
  const started = applyGameCommand({ state: choiceState, context: normalMoveContext(), command: { id: "interceptor-reject-start", type: "PASS_STARTED", payload: { pieceId: "blue-1", passId: "interceptor-reject" } } });
  const targeted = applyGameCommand({ state: started.nextState, context: normalMoveContext(), command: { id: "interceptor-reject-target", type: "PASS_TARGET_SELECTED", payload: { passId: "interceptor-reject", x: 9, y: 5 } } });
  const route = applyGameCommand({ state: targeted.nextState, context: normalMoveContext(), command: { id: "interceptor-reject-route", type: "PASS_ROUTE_CONFIRMED", payload: { passId: "interceptor-reject", cornerId: "top-left" } } });
  for (const [payload, reason] of [
    [{ passId: "interceptor-reject", decisionId: "stale", pieceId: "red-1" }, "PASS_INTERCEPTOR_DECISION_STALE"],
    [{ passId: "interceptor-reject", decisionId: route.nextState.actionResolution.pendingDecision.id, pieceId: "blue-1" }, "PASS_INTERCEPTOR_INVALID"],
    [{ passId: "wrong-pass", decisionId: route.nextState.actionResolution.pendingDecision.id, pieceId: "red-1" }, "PASS_NOT_INTERCEPTOR_SELECTING"],
  ]) {
    const before = structuredClone(route.nextState);
    assert.deepEqual(applyGameCommand({
      state: route.nextState, context: normalMoveContext(),
      command: { id: `interceptor-reject-${reason}`, type: "PASS_INTERCEPTOR_SELECTED", payload },
    }), { accepted: false, reason });
    assert.deepEqual(route.nextState, before);
  }
});

test("PASS_INTERCEPTOR_SELECTED stays atomic and outside Tracker economy for Bonus Pass", () => {
  const start = createGameState({
    ...normalMoveState(),
    pieces: [...normalMoveState().pieces,
      { id: "red-1", team: "B", cardId: "card-red-1", x: 5, y: 7 },
      { id: "red-2", team: "B", cardId: "card-red-2", x: 5, y: 3 },
    ],
    actionContinuation: { id: "bonus-interceptor", kind: "bonus-card-action", team: "blue", status: "ready", resumePolicy: { type: "resume-phase", team: "blue", phase: "attack" } },
  });
  const started = applyGameCommand({ state: start, context: normalMoveContext(), command: { id: "bonus-interceptor-start", type: "PASS_STARTED", payload: { pieceId: "blue-1", passId: "bonus-interceptor-pass" } } });
  const targeted = applyGameCommand({ state: started.nextState, context: normalMoveContext(), command: { id: "bonus-interceptor-target", type: "PASS_TARGET_SELECTED", payload: { passId: "bonus-interceptor-pass", x: 9, y: 5 } } });
  const route = applyGameCommand({ state: targeted.nextState, context: normalMoveContext(), command: { id: "bonus-interceptor-route", type: "PASS_ROUTE_CONFIRMED", payload: { passId: "bonus-interceptor-pass", cornerId: "top-left" } } });
  const result = applyGameCommand({
    state: route.nextState, context: normalMoveContext(),
    command: { id: "bonus-interceptor-choice", type: "PASS_INTERCEPTOR_SELECTED", payload: { passId: "bonus-interceptor-pass", decisionId: route.nextState.actionResolution.pendingDecision.id, pieceId: "red-2" } },
  });
  assert.equal(result.accepted, true);
  assert.equal(result.timeline.groupId, "bonus-interceptor");
  assert.equal(result.timeline.undoMode, "atomic");
  assert.equal(result.nextState.tracker.usedActions.blue, 0);
  assert.equal(result.nextState.actionResolution.pendingRoll.subjectId, "red-2");
});

test("PASS_INTERCEPTION_ROLL_SUBMITTED consumes the exact pending roll and starts only the canonical delayed handoff", () => {
  const rollState = createGameState({
    ...normalMoveState(),
    pieces: [...normalMoveState().pieces, { id: "red-1", team: "B", cardId: "card-red-1", x: 5, y: 7 }],
  });
  const started = applyGameCommand({ state: rollState, context: normalMoveContext(), command: { id: "roll-submit-start", type: "PASS_STARTED", payload: { pieceId: "blue-1", passId: "roll-submit-pass" } } });
  const targeted = applyGameCommand({ state: started.nextState, context: normalMoveContext(), command: { id: "roll-submit-target", type: "PASS_TARGET_SELECTED", payload: { passId: "roll-submit-pass", x: 9, y: 5 } } });
  const routed = applyGameCommand({ state: targeted.nextState, context: normalMoveContext(), command: { id: "roll-submit-route", type: "PASS_ROUTE_CONFIRMED", payload: { passId: "roll-submit-pass", cornerId: "top-left" } } });
  const pendingRoll = routed.nextState.actionResolution.pendingRoll;
  const before = structuredClone(routed.nextState);
  const result = applyGameCommand({
    state: routed.nextState, context: normalMoveContext(),
    command: {
      id: "roll-submit", type: "PASS_INTERCEPTION_ROLL_SUBMITTED",
      payload: {
        passId: "roll-submit-pass",
        createdAt: 1000,
        rollEvent: { id: "roll-event-1", requestId: pendingRoll.requestId, actionId: "roll-submit-pass", team: "red", dieType: 20, natural: 13, source: "RANDOM", createdAt: 1000, subjectId: "red-1", reactionIndex: 0 },
      },
    },
  });
  assert.equal(result.accepted, true);
  assert.equal(result.events[0].type, "DICE_ROLLED");
  assert.equal(result.nextState.actionResolution.status, "awaiting-interception-resolution");
  assert.equal(result.nextState.actionResolution.pendingRoll, null);
  assert.equal(result.nextState.actionResolution.lastRollEvent.id, "roll-event-1");
  assert.deepEqual(result.nextState.actionResolution.consumedEventIds, ["roll-event-1"]);
  assert.equal(result.nextState.dice.redResult, 13);
  assert.equal(result.events[0].metadata.delayedResolution.payload.defenderId, "red-1");
  assert.deepEqual(result.nextState.tracker, before.tracker);
  assert.deepEqual(result.nextState.pieces, before.pieces);
  const submittedBefore = structuredClone(result.nextState);
  assert.deepEqual(applyGameCommand({
    state: result.nextState, context: normalMoveContext(),
    command: {
      id: "roll-submit-replay", type: "PASS_INTERCEPTION_ROLL_SUBMITTED",
      payload: {
        passId: "roll-submit-pass",
        createdAt: 1001,
        rollEvent: { id: "roll-event-1", requestId: pendingRoll.requestId, actionId: "roll-submit-pass", team: "red", dieType: 20, natural: 13, source: "RANDOM", createdAt: 1000, subjectId: "red-1", reactionIndex: 0 },
      },
    },
  }), { accepted: false, reason: "PASS_NOT_INTERCEPTION_ROLLING" });
  assert.deepEqual(result.nextState, submittedBefore);
});

test("PASS_INTERCEPTION_ROLL_SUBMITTED rejects an invalid or replayed roll without mutation", () => {
  const rollState = createGameState({
    ...normalMoveState(),
    pieces: [...normalMoveState().pieces, { id: "red-1", team: "B", cardId: "card-red-1", x: 5, y: 7 }],
  });
  const started = applyGameCommand({ state: rollState, context: normalMoveContext(), command: { id: "roll-reject-start", type: "PASS_STARTED", payload: { pieceId: "blue-1", passId: "roll-reject-pass" } } });
  const targeted = applyGameCommand({ state: started.nextState, context: normalMoveContext(), command: { id: "roll-reject-target", type: "PASS_TARGET_SELECTED", payload: { passId: "roll-reject-pass", x: 9, y: 5 } } });
  const routed = applyGameCommand({ state: targeted.nextState, context: normalMoveContext(), command: { id: "roll-reject-route", type: "PASS_ROUTE_CONFIRMED", payload: { passId: "roll-reject-pass", cornerId: "top-left" } } });
  const pendingRoll = routed.nextState.actionResolution.pendingRoll;
  const before = structuredClone(routed.nextState);
  assert.deepEqual(applyGameCommand({
    state: routed.nextState, context: normalMoveContext(),
    command: { id: "roll-reject", type: "PASS_INTERCEPTION_ROLL_SUBMITTED", payload: { passId: "roll-reject-pass", createdAt: 1000, rollEvent: { id: "wrong-roll", requestId: "stale", actionId: "roll-reject-pass", team: "red", dieType: 20, natural: 13, source: "RANDOM", createdAt: 1000, subjectId: "red-1", reactionIndex: 0 } } },
  }), { accepted: false, reason: "PASS_INTERCEPTION_ROLL_INVALID" });
  assert.deepEqual(routed.nextState, before);
  assert.equal(pendingRoll.subjectId, "red-1");
});

test("PASS_INTERCEPTION_RESOLUTION_DUE records the frozen deterministic result without applying Pass consequences", () => {
  const rollState = createGameState({
    ...normalMoveState(),
    pieces: [...normalMoveState().pieces, { id: "red-1", team: "B", cardId: "card-red-1", x: 5, y: 7 }],
  });
  const started = applyGameCommand({ state: rollState, context: normalMoveContext(), command: { id: "resolution-start", type: "PASS_STARTED", payload: { pieceId: "blue-1", passId: "resolution-pass" } } });
  const targeted = applyGameCommand({ state: started.nextState, context: normalMoveContext(), command: { id: "resolution-target", type: "PASS_TARGET_SELECTED", payload: { passId: "resolution-pass", x: 9, y: 5 } } });
  const routed = applyGameCommand({ state: targeted.nextState, context: normalMoveContext(), command: { id: "resolution-route", type: "PASS_ROUTE_CONFIRMED", payload: { passId: "resolution-pass", cornerId: "top-left" } } });
  const pendingRoll = routed.nextState.actionResolution.pendingRoll;
  const rolled = applyGameCommand({
    state: routed.nextState, context: normalMoveContext(),
    command: { id: "resolution-roll", type: "PASS_INTERCEPTION_ROLL_SUBMITTED", payload: { passId: "resolution-pass", createdAt: 1000, rollEvent: { id: "resolution-roll-event", requestId: pendingRoll.requestId, actionId: "resolution-pass", team: "red", dieType: 20, natural: 20, source: "RANDOM", createdAt: 1000, subjectId: "red-1", reactionIndex: 0 } } },
  });
  const before = structuredClone(rolled.nextState);
  const resolved = applyGameCommand({
    state: rolled.nextState, context: normalMoveContext(),
    command: { id: "resolution-due", type: "PASS_INTERCEPTION_RESOLUTION_DUE", payload: { passId: "resolution-pass", rollEventId: "resolution-roll-event" } },
  });
  assert.equal(resolved.accepted, true);
  assert.equal(resolved.events[0].type, "PASS_INTERCEPTION_RESOLVED");
  assert.equal(resolved.nextState.actionResolution.status, "interception-resolved");
  assert.equal(resolved.nextState.actionResolution.lastResolution.outcome, "natural-20-interception");
  assert.equal(resolved.nextState.actionResolution.lastResolution.natural, 20);
  assert.deepEqual(resolved.nextState.pieces, before.pieces);
  assert.deepEqual(resolved.nextState.tracker, before.tracker);
  assert.equal(resolved.nextState.actionContinuation, before.actionContinuation);
  const after = structuredClone(resolved.nextState);
  assert.deepEqual(applyGameCommand({
    state: resolved.nextState, context: normalMoveContext(),
    command: { id: "resolution-replay", type: "PASS_INTERCEPTION_RESOLUTION_DUE", payload: { passId: "resolution-pass", rollEventId: "resolution-roll-event" } },
  }), { accepted: false, reason: "PASS_NOT_INTERCEPTION_RESOLVING" });
  assert.deepEqual(resolved.nextState, after);
});

test("PASS_CONSEQUENCE_DUE completes a Pass with no interceptor through the Engine", () => {
  const { context, confirmed } = confirmedPass(normalMoveState(), "complete-pass");
  assert.equal(confirmed.nextState.actionResolution.status, "completing");
  const result = applyGameCommand({
    state: confirmed.nextState, context,
    command: { id: "complete-pass-consequence", type: "PASS_CONSEQUENCE_DUE", payload: { passId: "complete-pass" } },
  });
  assert.equal(result.accepted, true);
  assert.equal(result.events[0].type, "PASS_COMPLETED");
  assert.deepEqual(result.nextState.pieces.find(piece => piece.id === "ball"), { id: "ball", team: "BALL", x: 9, y: 5 });
  assert.equal(result.nextState.actionResolution, null);
  assert.equal(result.nextState.tracker.usedActions.blue, 1);
});

test("PASS_CONSEQUENCE_DUE transfers possession and starts a clean turn after an ordinary interception", () => {
  const state = createGameState({
    ...normalMoveState(),
    pieces: [...normalMoveState().pieces, { id: "red-1", team: "B", cardId: "card-red-1", x: 5, y: 7 }],
  });
  const { context, resolved } = resolvedPassInterception(state, "intercept-pass", 19);
  assert.equal(resolved.nextState.actionResolution.lastResolution.outcome, "interception");
  const result = applyGameCommand({
    state: resolved.nextState, context,
    command: { id: "intercept-pass-consequence", type: "PASS_CONSEQUENCE_DUE", payload: { passId: "intercept-pass", rollEventId: "intercept-pass-roll-event" } },
  });
  assert.equal(result.accepted, true);
  assert.equal(result.events[0].type, "PASS_INTERCEPTED");
  assert.equal(result.nextState.tracker.startingTeam, "red");
  assert.equal(result.nextState.tracker.currentTurn, 2);
  assert.deepEqual(result.nextState.tracker.usedActions, { red: 0, blue: 0 });
  assert.deepEqual(result.nextState.pieces.find(piece => piece.id === "ball"), { id: "ball", team: "BALL", x: 5, y: 7 });
  assert.equal(result.nextState.actionResolution, null);
});

test("PASS_CONSEQUENCE_DUE carries Natural 1's minus one to the next interceptor", () => {
  const state = createGameState({
    ...normalMoveState(),
    pieces: [...normalMoveState().pieces,
      { id: "red-1", team: "B", cardId: "card-red-1", x: 5, y: 7 },
      { id: "red-2", team: "B", cardId: "card-red-2", x: 5, y: 3 },
    ],
  });
  const { context, confirmed } = confirmedPass(state, "natural-one-pass");
  const choice = applyGameCommand({
    state: confirmed.nextState, context,
    command: { id: "natural-one-choice", type: "PASS_INTERCEPTOR_SELECTED", payload: { passId: "natural-one-pass", decisionId: confirmed.nextState.actionResolution.pendingDecision.id, pieceId: "red-1" } },
  });
  const pendingRoll = choice.nextState.actionResolution.pendingRoll;
  const rolled = applyGameCommand({
    state: choice.nextState, context,
    command: { id: "natural-one-roll", type: "PASS_INTERCEPTION_ROLL_SUBMITTED", payload: { passId: "natural-one-pass", createdAt: 1000, rollEvent: { id: "natural-one-roll-event", requestId: pendingRoll.requestId, actionId: "natural-one-pass", team: "red", dieType: 20, natural: 1, source: "RANDOM", createdAt: 1000, subjectId: "red-1", reactionIndex: 0 } } },
  });
  const resolved = applyGameCommand({
    state: rolled.nextState, context,
    command: { id: "natural-one-resolution", type: "PASS_INTERCEPTION_RESOLUTION_DUE", payload: { passId: "natural-one-pass", rollEventId: "natural-one-roll-event" } },
  });
  const result = applyGameCommand({
    state: resolved.nextState, context,
    command: { id: "natural-one-consequence", type: "PASS_CONSEQUENCE_DUE", payload: { passId: "natural-one-pass", rollEventId: "natural-one-roll-event" } },
  });
  assert.equal(result.accepted, true);
  assert.equal(result.events[0].type, "PASS_INTERCEPTION_MISSED");
  assert.equal(result.nextState.actionResolution.status, "awaiting-interception-roll");
  assert.equal(result.nextState.actionResolution.pendingRoll.subjectId, "red-2");
  assert.equal(result.nextState.actionResolution.naturalOneDisadvantageStacks, 1);
});

test("PASS_CONSEQUENCE_DUE completes the atomic Bonus Pass and creates Natural 20's deferred Bonus Action", () => {
  const bonusState = createGameState({
    ...normalMoveState(),
    actionContinuation: { id: "bonus-complete", kind: "bonus-card-action", team: "blue", status: "ready", resumePolicy: { type: "resume-phase", team: "blue", phase: "attack" } },
  });
  const bonus = confirmedPass(bonusState, "bonus-complete-pass");
  const completed = applyGameCommand({
    state: bonus.confirmed.nextState, context: bonus.context,
    command: { id: "bonus-complete-consequence", type: "PASS_CONSEQUENCE_DUE", payload: { passId: "bonus-complete-pass" } },
  });
  assert.equal(completed.accepted, true);
  assert.equal(completed.timeline.undoMode, "atomic");
  assert.equal(completed.nextState.actionContinuation.status, "awaiting-end-bonus-action");
  assert.equal(completed.nextState.tracker.usedActions.blue, 0);

  const interceptedState = createGameState({
    ...normalMoveState(),
    pieces: [...normalMoveState().pieces, { id: "red-1", team: "B", cardId: "card-red-1", x: 5, y: 7 }],
  });
  const { context, resolved } = resolvedPassInterception(interceptedState, "natural-twenty-pass", 20);
  const naturalTwenty = applyGameCommand({
    state: resolved.nextState, context,
    command: { id: "natural-twenty-consequence", type: "PASS_CONSEQUENCE_DUE", payload: { passId: "natural-twenty-pass", rollEventId: "natural-twenty-pass-roll-event" } },
  });
  assert.equal(naturalTwenty.accepted, true);
  assert.equal(naturalTwenty.events[0].type, "PASS_NATURAL_20");
  assert.deepEqual(naturalTwenty.nextState.pieces.find(piece => piece.id === "ball"), { id: "ball", team: "BALL", x: 5, y: 7 });
  assert.equal(naturalTwenty.nextState.actionResolution, null);
  assert.equal(naturalTwenty.nextState.actionContinuation.team, "red");
  assert.equal(naturalTwenty.nextState.actionContinuation.status, "ready");
  assert.equal(naturalTwenty.nextState.actionContinuation.resumePolicy.nextTurn, 2);
  assert.equal(naturalTwenty.nextState.actionContinuation.origin.reason, "NATURAL_20");
  assert.deepEqual(naturalTwenty.nextState.tracker, resolved.nextState.tracker);
  assert.equal(naturalTwenty.events[0].metadata.undoTransaction.id, resolved.nextState.actionResolution.resolutionTransaction.id);
});

test("Natural 20 replaces an interrupted Bonus Action and records the continuation chain", () => {
  const state = createGameState({
    ...normalMoveState(),
    pieces: [...normalMoveState().pieces, { id: "red-1", team: "B", cardId: "card-red-1", x: 5, y: 7 }],
    actionContinuation: { id: "bonus-blue", kind: "bonus-card-action", team: "blue", status: "ready", resumePolicy: { type: "advance-turn", team: "blue", nextTurn: 2, phase: "attack" } },
  });
  const { context, resolved } = resolvedPassInterception(state, "replacement-natural-twenty", 20);
  const result = applyGameCommand({
    state: resolved.nextState, context,
    command: { id: "replacement-natural-twenty-consequence", type: "PASS_CONSEQUENCE_DUE", payload: { passId: "replacement-natural-twenty", rollEventId: "replacement-natural-twenty-roll-event" } },
  });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.actionContinuation.team, "red");
  assert.equal(result.nextState.actionContinuation.origin.parentContinuationId, "bonus-blue");
  assert.equal(result.events[0].metadata.bonusAction.supersededContinuationId, "bonus-blue");
  assert.equal(result.nextState.actionContinuation.resumePolicy.nextTurn, 2);
});

test("EXTRA_ROLL_SUBMITTED is an explicit administrative Match event and never consumes Tracker", () => {
  const state = normalMoveState();
  const result = applyGameCommand({
    state, context: normalMoveContext(),
    command: { id: "extra-roll", type: "EXTRA_ROLL_SUBMITTED", payload: { team: "blue", dieType: 12, result: 7, rollSource: "CHOSEN" } },
  });
  assert.equal(result.accepted, true);
  assert.equal(result.events[0].type, "EXTRA_ROLL");
  assert.equal(result.events[0].metadata.administrative, true);
  assert.equal(result.nextState.dice.blueResult, 7);
  assert.equal(result.nextState.dice.blueLastDieType, 12);
  assert.deepEqual(result.nextState.tracker, state.tracker);
});

test("EXTRA_ROLL_SUBMITTED remains available during a Bonus Action without changing it", () => {
  const state = normalMoveState({
    actionContinuation: {
      id: "bonus-extra-roll",
      kind: "bonus-card-action",
      team: "red",
      status: "ready",
      resumePolicy: { type: "resume-phase", team: "red", phase: "attack" },
    },
  });
  const result = applyGameCommand({
    state, context: normalMoveContext(),
    command: { id: "bonus-extra-roll", type: "EXTRA_ROLL_SUBMITTED", payload: { team: "blue", dieType: 20, result: 9, rollSource: "RANDOM" } },
  });
  assert.equal(result.accepted, true);
  assert.equal(result.events[0].type, "EXTRA_ROLL");
  assert.equal(result.nextState.dice.blueResult, 9);
  assert.deepEqual(result.nextState.actionContinuation, state.actionContinuation);
  assert.deepEqual(result.nextState.tracker, state.tracker);
});

test("PASS_ROUTE_CONFIRMED keeps Bonus Pass atomic and outside Tracker economy", () => {
  const start = createGameState({
    ...normalMoveState(),
    actionContinuation: { id: "bonus-route", kind: "bonus-card-action", team: "blue", status: "ready", resumePolicy: { type: "resume-phase", team: "blue", phase: "attack" } },
  });
  const started = applyGameCommand({ state: start, context: normalMoveContext(), command: { id: "bonus-route-start", type: "PASS_STARTED", payload: { pieceId: "blue-1", passId: "bonus-route-pass" } } });
  const targeted = applyGameCommand({ state: started.nextState, context: normalMoveContext(), command: { id: "bonus-route-target", type: "PASS_TARGET_SELECTED", payload: { passId: "bonus-route-pass", x: 9, y: 5 } } });
  const confirmed = applyGameCommand({ state: targeted.nextState, context: normalMoveContext(), command: { id: "bonus-route-confirm", type: "PASS_ROUTE_CONFIRMED", payload: { passId: "bonus-route-pass", cornerId: "top-left" } } });
  assert.equal(confirmed.accepted, true);
  assert.equal(confirmed.timeline.groupId, "bonus-route");
  assert.equal(confirmed.nextState.tracker.usedActions.blue, 0);
  assert.equal(confirmed.nextState.actionResolution.bonusContinuationId, "bonus-route");
});

test("PASS_STARTED rejects an invalid passer, a non-carrier, and an exhausted normal phase without mutating state", () => {
  const start = normalMoveState();
  for (const [state, command, reason] of [
    [start, { id: "pass-no-piece", type: "PASS_STARTED", payload: { pieceId: "missing", passId: "p" } }, "PASSER_INVALID"],
    [createGameState({ ...start, pieces: start.pieces.map(piece => piece.id === "ball" ? { ...piece, x: 4 } : piece) }), { id: "pass-no-ball", type: "PASS_STARTED", payload: { pieceId: "blue-1", passId: "p" } }, "PASS_REQUIRES_BALL"],
    [createGameState({ ...start, tracker: { ...start.tracker, usedActions: { blue: 5, red: 0 } } }), { id: "pass-exhausted", type: "PASS_STARTED", payload: { pieceId: "blue-1", passId: "p" } }, "ACTIONS_COMPLETE_END_TURN"],
  ]) {
    const before = structuredClone(state);
    assert.deepEqual(applyGameCommand({ state, context: normalMoveContext(), command }), { accepted: false, reason });
    assert.deepEqual(state, before);
  }
});

test("Phase 8A administrative Tracker safety commands are Engine-owned and reversible", () => {
  const state = normalMoveState({
    movementStateByPieceId: { "blue-1": { spent: 2, distance: 2, axis: "horizontal" } },
    tracker: {
      ...normalMoveState().tracker,
      usedActions: { blue: 2, red: 1 },
      actionLog: { blue: [{ id: "old-blue", type: "PASS", pieceId: "blue-1" }, { id: "old-blue-2", type: "SHOT", pieceId: "blue-1" }], red: [{ id: "old-red", type: "TACKLING", pieceId: "red-1" }] },
    },
  });
  const reset = applyGameCommand({ state, context: normalMoveContext(), command: { id: "tracker-reset", type: "TRACKER_ACTIONS_RESET", payload: {} } });
  assert.equal(reset.accepted, true);
  assert.equal(reset.events[0].type, "TRACKER_RESET");
  assert.equal(reset.events[0].metadata.administrative, true);
  assert.deepEqual(reset.nextState.tracker.usedActions, { blue: 0, red: 0 });
  assert.deepEqual(reset.nextState.movementStateByPieceId, {});

  const possession = applyGameCommand({ state, context: normalMoveContext(), command: { id: "tracker-possession", type: "TRACKER_POSSESSION_CHANGED", payload: {} } });
  assert.equal(possession.accepted, true);
  assert.equal(possession.events[0].type, "POSSESSION_CHANGED");
  assert.equal(possession.nextState.tracker.startingTeam, "red");
  assert.equal(possession.nextState.tracker.turnPhase, "attack");
  assert.deepEqual(possession.nextState.tracker.usedActions, { blue: 0, red: 0 });
});

test("PIECE_ACTIVITY_CHANGED owns Match activity while preserving Editor Workspace independence", () => {
  const state = normalMoveState();
  const changed = applyGameCommand({
    state, context: normalMoveContext(),
    command: { id: "blue-inactive", type: "PIECE_ACTIVITY_CHANGED", payload: { pieceId: "blue-1", inactive: true } },
  });
  assert.equal(changed.accepted, true);
  assert.equal(changed.events[0].type, "PIECE_ACTIVITY_CHANGED");
  assert.equal(changed.events[0].metadata.inactive, true);
  assert.equal(changed.nextState.pieces.find(piece => piece.id === "blue-1").inactive, true);
  assert.deepEqual(state.pieces.find(piece => piece.id === "blue-1").inactive, undefined);
  assert.deepEqual(
    applyGameCommand({ state: createGameState({ ...state, gameMode: "editor" }), context: normalMoveContext(), command: { id: "editor-inactive", type: "PIECE_ACTIVITY_CHANGED", payload: { pieceId: "blue-1", inactive: true } } }),
    { accepted: false, reason: "MATCH_MODE_REQUIRED" },
  );
});

test("unimplemented normal actions become canonical manual declarations without moving a piece", () => {
  const state = normalMoveState();
  const result = applyGameCommand({
    state, context: normalMoveContext(),
    command: { id: "manual-dribble", type: "MANUAL_ACTION_DECLARED", payload: { pieceId: "blue-1", actionType: "DRIBBLE" } },
  });
  assert.equal(result.accepted, true);
  assert.equal(result.events[0].type, "MANUAL_ACTION_DECLARED");
  assert.deepEqual(result.events[0].metadata, { actionType: "DRIBBLE", pieceId: "blue-1", manualResolutionRequired: true });
  assert.equal(result.nextState.tracker.usedActions.blue, 1);
  assert.equal(result.nextState.tracker.actionLog.blue[0].type, "DRIBBLE");
  assert.deepEqual(result.nextState.pieces, state.pieces);
});

test("unimplemented Bonus actions become canonical manual declarations and await END B.A.", () => {
  const state = normalMoveState({
    actionContinuation: { id: "bonus-manual", kind: "bonus-card-action", team: "blue", status: "ready", resumePolicy: { type: "resume-phase", team: "blue", phase: "attack" } },
  });
  const result = applyGameCommand({
    state, context: normalMoveContext(),
    command: { id: "bonus-manual-shot", type: "BONUS_MANUAL_ACTION_DECLARED", payload: { pieceId: "blue-1", actionType: "SHOT" } },
  });
  assert.equal(result.accepted, true);
  assert.equal(result.events[0].type, "BONUS_MANUAL_ACTION_DECLARED");
  assert.equal(result.nextState.actionContinuation.status, "awaiting-end-bonus-action");
  assert.equal(result.nextState.actionContinuation.actionType, "SHOT");
  assert.equal(result.nextState.tracker.usedActions.blue, 0);
});
