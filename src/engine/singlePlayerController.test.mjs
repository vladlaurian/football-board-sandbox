import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createGameState } from "../game/gameState.mjs";
import { redoTimeline, undoTimeline } from "../timeline/timelineEngine.mjs";
import { dispatchSinglePlayerGameCommand, dispatchSinglePlayerGameCommandSequence } from "./singlePlayerController.mjs";

function matchState() {
  return createGameState({
    gameMode: "match",
    pieces: [{ id: "ball", team: "BALL", x: 4, y: 5 }],
  });
}

function command(overrides = {}) {
  return {
    id: "cmd-controller-free-ball",
    type: "FREE_BALL_MOVED",
    payload: { x: 7, y: 8 },
    ...overrides,
  };
}

function normalMoveState() {
  return createGameState({
    gameMode: "match",
    pieces: [
      { id: "ball", team: "BALL", x: 3, y: 5 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 3, y: 5 },
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
  });
}

function normalMoveContext() {
  return { gameplayCards: [{ id: "card-blue-1", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 4 }] }] };
}

test("Single Player Controller records engine Free Ball result in Timeline and supports Undo/Redo", () => {
  const start = matchState();
  const dispatched = dispatchSinglePlayerGameCommand({
    state: start,
    context: {},
    command: command(),
    label: "Ball → H8",
  });

  assert.equal(dispatched.result.accepted, true);
  assert.equal(dispatched.timeline.entries.length, 1);
  assert.equal(dispatched.entry.type, "BALL_MOVED");
  assert.deepEqual(dispatched.entry.metadata, {
    pieceId: "ball",
    from: { x: 4, y: 5 },
    to: { x: 7, y: 8 },
    movementReason: "FREE_BALL",
  });
  assert.deepEqual(dispatched.state.pieces[0], { id: "ball", team: "BALL", x: 7, y: 8 });

  const undone = undoTimeline(dispatched.timeline);
  assert.deepEqual(undone.state.pieces[0], { id: "ball", team: "BALL", x: 4, y: 5 });
  const redone = redoTimeline(undone.timeline);
  assert.deepEqual(redone.state.pieces[0], { id: "ball", team: "BALL", x: 7, y: 8 });
});

test("Single Player Controller leaves Timeline untouched when engine rejects command", () => {
  const start = matchState();
  const dispatched = dispatchSinglePlayerGameCommand({
    state: start,
    context: {},
    command: command({ payload: { x: 4, y: 5 } }),
  });

  assert.deepEqual(dispatched.result, { accepted: false, reason: "BALL_POSITION_UNCHANGED" });
  assert.equal(dispatched.timeline.entries.length, 0);
  assert.deepEqual(dispatched.state, start);
});

test("Single Player Controller preserves Undo/Redo for progressive normal MOVE segments", () => {
  const started = dispatchSinglePlayerGameCommand({
    state: normalMoveState(),
    context: normalMoveContext(),
    command: { id: "normal-start", type: "NORMAL_MOVE_STARTED", payload: { pieceId: "blue-1" } },
  });
  const committed = dispatchSinglePlayerGameCommand({
    timeline: started.timeline,
    state: started.state,
    context: normalMoveContext(),
    command: { id: "normal-commit", type: "NORMAL_MOVE_COMMITTED", payload: { pieceId: "blue-1", x: 5, y: 5 } },
  });
  assert.equal(committed.timeline.entries.length, 2);
  assert.equal(committed.entry.type, "PIECE_MOVED");
  assert.equal(committed.state.tracker.usedActions.blue, 1);
  assert.equal(committed.state.pieces.find(piece => piece.id === "blue-1").x, 5);

  const continued = dispatchSinglePlayerGameCommand({
    timeline: committed.timeline,
    state: committed.state,
    context: normalMoveContext(),
    command: { id: "normal-continued", type: "NORMAL_MOVE_COMMITTED", payload: { pieceId: "blue-1", x: 6, y: 5 } },
  });
  assert.equal(continued.timeline.entries.length, 3);
  assert.equal(continued.state.tracker.usedActions.blue, 1);
  assert.equal(continued.state.pieces.find(piece => piece.id === "blue-1").x, 6);

  const undoneContinuation = undoTimeline(continued.timeline);
  assert.equal(undoneContinuation.state.pieces.find(piece => piece.id === "blue-1").x, 5);
  const undoneCommit = undoTimeline(undoneContinuation.timeline);
  assert.equal(undoneCommit.state.pieces.find(piece => piece.id === "blue-1").x, 3);
  assert.equal(undoneCommit.state.tracker.matchActionState.activeMovement.active, true);
  const undoneStart = undoTimeline(undoneCommit.timeline);
  assert.equal(undoneStart.state.tracker.usedActions.blue, 0);
  const redoneStart = redoTimeline(undoneStart.timeline);
  const redoneCommit = redoTimeline(redoneStart.timeline);
  const redoneContinuation = redoTimeline(redoneCommit.timeline);
  assert.equal(redoneContinuation.state.pieces.find(piece => piece.id === "blue-1").x, 6);
  assert.equal(redoneContinuation.state.tracker.matchActionState.activeMovement.active, false);
});

test("Single Player Controller records THREE_TWO_MOVE through Timeline and supports Undo/Redo", () => {
  const start = createGameState({
    ...normalMoveState(),
    pieces: [
      { id: "ball", team: "BALL", x: 5, y: 5 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 2, y: 5 },
    ],
  });
  const dispatched = dispatchSinglePlayerGameCommand({
    state: start,
    context: normalMoveContext(),
    command: { id: "three-two-controller", type: "THREE_TWO_MOVE_COMMITTED", payload: { pieceId: "blue-1", x: 5, y: 5 } },
  });
  assert.equal(dispatched.result.accepted, true);
  assert.equal(dispatched.entry.type, "THREE_TWO_MOVE");
  assert.equal(dispatched.state.pieces.find(piece => piece.id === "blue-1").x, 5);
  const undone = undoTimeline(dispatched.timeline);
  assert.equal(undone.state.pieces.find(piece => piece.id === "blue-1").x, 2);
  const redone = redoTimeline(undone.timeline);
  assert.equal(redone.state.pieces.find(piece => piece.id === "blue-1").x, 5);
});

test("Single Player Controller publishes direct-board normal MOVE only when start and first segment both succeed", () => {
  const start = normalMoveState();
  const complete = dispatchSinglePlayerGameCommandSequence({
    state: start,
    context: normalMoveContext(),
    commands: [
      { command: { id: "board-start", type: "NORMAL_MOVE_STARTED", payload: { pieceId: "blue-1" } }, label: "Blue MOVE" },
      { command: { id: "board-commit", type: "NORMAL_MOVE_COMMITTED", payload: { pieceId: "blue-1", x: 5, y: 5 } }, label: "Blue → F5" },
    ],
  });
  assert.equal(complete.accepted, true);
  assert.equal(complete.timeline.entries.length, 2);
  assert.equal(complete.state.tracker.usedActions.blue, 1);
  assert.equal(complete.state.tracker.matchActionState.byPieceId["blue-1"].moveAuthorized, true);

  const rejected = dispatchSinglePlayerGameCommandSequence({
    state: start,
    context: {},
    commands: [
      { command: { id: "board-start-rejected", type: "NORMAL_MOVE_STARTED", payload: { pieceId: "blue-1" } } },
      { command: { id: "board-commit-rejected", type: "NORMAL_MOVE_COMMITTED", payload: { pieceId: "blue-1", x: 5, y: 5 } } },
    ],
  });
  assert.equal(rejected.accepted, false);
  assert.deepEqual(rejected.result, { accepted: false, reason: "no-speed" });
  assert.equal(rejected.timeline.entries.length, 0);
  assert.equal(rejected.state.tracker.usedActions.blue, 0);
});

test("Single Player Controller does not depend on UI, Firebase, or browser APIs", () => {
  const source = fs.readFileSync(new URL("./singlePlayerController.mjs", import.meta.url), "utf8");
  const forbidden = /(?:from\s+["'](?:react|firebase\/|firebase)["']|\bwindow\b|\bdocument\b|\blocalStorage\b|\bsetTimeout\b|\bsetInterval\b|\bfetch\b|\bXMLHttpRequest\b)/;
  assert.equal(forbidden.test(source), false);
});

test("Single Player Controller records Free Move start, segments, and end as ordinary Undo/Redo Timeline entries", () => {
  const start = normalMoveState();
  const freeStart = dispatchSinglePlayerGameCommand({
    state: start, context: normalMoveContext(),
    command: { id: "free-start", type: "FREE_MOVE_STARTED", payload: { pieceId: "blue-1" } },
  });
  const freeCommit = dispatchSinglePlayerGameCommand({
    timeline: freeStart.timeline, state: freeStart.state, context: normalMoveContext(),
    command: { id: "free-commit", type: "FREE_MOVE_COMMITTED", payload: { pieceId: "blue-1", x: 9, y: 6 } },
  });
  const freeEnd = dispatchSinglePlayerGameCommand({
    timeline: freeCommit.timeline, state: freeCommit.state, context: normalMoveContext(),
    command: { id: "free-end", type: "FREE_MOVE_ENDED", payload: { pieceId: "blue-1" } },
  });
  assert.deepEqual(freeEnd.timeline.entries.map(entry => entry.type), ["FREE_MODE_STARTED", "FREE_MOVE", "FREE_MODE_ENDED"]);
  const undoEnd = undoTimeline(freeEnd.timeline);
  assert.equal(undoEnd.state.tracker.matchActionState.freeMode.active, true);
  const undoMove = undoTimeline(undoEnd.timeline);
  assert.equal(undoMove.state.pieces.find(piece => piece.id === "blue-1").x, 3);
  const redoMove = redoTimeline(undoMove.timeline);
  const redoEnd = redoTimeline(redoMove.timeline);
  assert.equal(redoEnd.state.tracker.matchActionState.freeMode.active, false);
  assert.equal(redoEnd.state.pieces.find(piece => piece.id === "blue-1").x, 9);
});
