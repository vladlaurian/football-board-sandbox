import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createGameState } from "../game/gameState.mjs";
import { applyGameCommand } from "./gameEngine.mjs";
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
    gameplayCards: [{ id: "card-blue-1", name: "Blue 1", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 4 }] }],
  });
}

function normalMoveCommand(type, payload = {}, id = type.toLowerCase()) {
  return { id, type, payload: { pieceId: "blue-1", ...payload } };
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
  const moduleFiles = ["gameEngine.mjs", "gameCommands.mjs", "gameEvents.mjs", "matchContext.mjs", "movementPathRules.mjs", "normalMoveRules.mjs", "threeTwoMoveRules.mjs", "freeMoveRules.mjs", "singlePlayerController.mjs"];
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
