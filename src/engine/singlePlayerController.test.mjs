import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createGameState } from "../game/gameState.mjs";
import { redoAtomicTimelineTransaction, redoTimeline, undoAtomicTimelineTransaction, undoTimeline } from "../timeline/timelineEngine.mjs";
import { dispatchSinglePlayerGameCommand, dispatchSinglePlayerGameCommandSequence, dispatchSinglePlayerMatchStart } from "./singlePlayerController.mjs";

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

test("Single Player Controller retains a playable cursor-zero baseline for MATCH_STARTED", () => {
  const start = createGameState({ ...matchState(), tracker: { gameStarted: false, currentTurn: 0 } });
  const dispatched = dispatchSinglePlayerMatchStart({
    state: start,
    context: {},
    command: { id: "controller-match-start", type: "MATCH_STARTED", payload: { team: "red" } },
    label: "Match started: Red attacks",
  });
  assert.equal(dispatched.result.accepted, true);
  assert.equal(dispatched.timeline.entries.length, 1);
  assert.equal(dispatched.entry.type, "MATCH_STARTED");
  assert.equal(dispatched.state.tracker.gameStarted, true);
  assert.equal(dispatched.state.tracker.startingTeam, "red");
  const initial = dispatched.timeline.initialState;
  assert.equal(initial.tracker.gameStarted, true);
  assert.equal(initial.tracker.currentTurn, 1);
  const cursorZero = undoTimeline(dispatched.timeline);
  assert.equal(cursorZero.state.tracker.gameStarted, true);
  assert.equal(cursorZero.state.tracker.currentTurn, 1);
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

test("Single Player Controller publishes direct-board Bonus MOVE only when its start and first segment both succeed", () => {
  const start = createGameState({ ...normalMoveState(),
    actionContinuation: {
      id: "bonus-direct-1",
      kind: "bonus-card-action",
      team: "blue",
      status: "ready",
      resumePolicy: { type: "advance-turn", team: "blue", nextTurn: 2 },
    },
  });
  const complete = dispatchSinglePlayerGameCommandSequence({
    state: start,
    context: normalMoveContext(),
    commands: [
      { command: { id: "bonus-direct-start", type: "BONUS_MOVE_STARTED", payload: { pieceId: "blue-1" } }, label: "Bonus MOVE" },
      { command: { id: "bonus-direct-commit", type: "BONUS_MOVE_COMMITTED", payload: { pieceId: "blue-1", x: 5, y: 5 } }, label: "Bonus MOVE segment" },
    ],
  });
  assert.equal(complete.accepted, true);
  assert.deepEqual(complete.timeline.entries.map(entry => entry.type), ["BONUS_MOVE_STARTED", "BONUS_MOVE_COMMITTED"]);
  assert.equal(complete.state.tracker.usedActions.blue, 0);
  assert.equal(complete.state.actionContinuation.movementStarted, true);

  const rejected = dispatchSinglePlayerGameCommandSequence({
    state: start,
    context: normalMoveContext(),
    commands: [
      { command: { id: "bonus-direct-start-bad", type: "BONUS_MOVE_STARTED", payload: { pieceId: "blue-1" } }, label: "Bonus MOVE" },
      { command: { id: "bonus-direct-commit-bad", type: "BONUS_MOVE_COMMITTED", payload: { pieceId: "blue-1", x: 20, y: 5 } }, label: "Bonus MOVE segment" },
    ],
  });
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.timeline.entries.length, 0);
});

test("Single Player Controller records End B.A. as the final entry of its atomic Bonus Action transaction", () => {
  const start = createGameState({ ...normalMoveState(),
    actionContinuation: {
      id: "bonus-end-controller",
      kind: "bonus-card-action",
      team: "blue",
      status: "ready",
      resumePolicy: { type: "advance-turn", team: "blue", nextTurn: 2, phase: "attack" },
    },
  });
  const ended = dispatchSinglePlayerGameCommand({
    state: start,
    context: normalMoveContext(),
    command: { id: "bonus-end-controller-command", type: "BONUS_ACTION_ENDED", payload: { continuationId: "bonus-end-controller" } },
  });
  assert.equal(ended.result.accepted, true);
  assert.equal(ended.entry.type, "BONUS_ACTION_DECLINED");
  assert.equal(ended.entry.groupId, "bonus-end-controller");
  assert.equal(ended.entry.metadata.actionTransaction.undoMode, "atomic");
  assert.equal(ended.state.tracker.currentTurn, 2);

  const undone = undoAtomicTimelineTransaction(ended.timeline);
  assert.equal(undone.state.actionContinuation.id, "bonus-end-controller");
  const redone = redoAtomicTimelineTransaction(undone.timeline);
  assert.equal(redone.state.actionContinuation, null);
  assert.equal(redone.state.tracker.currentTurn, 2);
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

test("Single Player Controller records Group Move zone confirmation and each player segment through ordinary Undo/Redo", () => {
  const start = createGameState({
    ...normalMoveState(),
    pieces: [
      { id: "ball", team: "BALL", x: 12, y: 5 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 3, y: 5 },
    ],
    tracker: { ...normalMoveState().tracker, usedActions: { blue: 4, red: 0 }, actionLog: { blue: Array.from({ length: 4 }, (_, index) => ({ id: `a-${index}`, type: "PASS" })), red: [] } },
  });
  const context = { ...normalMoveContext(), boardSettings: { cols: 20, rows: 12 }, ruleSet: { actions: { groupMove: { maxPlayers: 4, zoneLength: 6, maxDistance: 6, sameDirectionOnly: true } } } };
  const zone = dispatchSinglePlayerGameCommand({ state: start, context, command: { id: "group-zone", type: "GROUP_MOVE_ZONE_CONFIRMED", payload: { team: "blue", zoneStartX: 2 } } });
  const moved = dispatchSinglePlayerGameCommand({ timeline: zone.timeline, state: zone.state, context, command: { id: "group-move", type: "GROUP_MOVE_PLAYER_COMMITTED", payload: { pieceId: "blue-1", x: 7, y: 5 } } });
  assert.deepEqual(moved.timeline.entries.map(entry => entry.type), ["GROUP_MOVE_ACTIVATED", "GROUP_MOVE_PIECE"]);
  const undone = undoTimeline(moved.timeline);
  assert.equal(undone.state.tracker.matchActionState.groupMove.active, true);
  assert.equal(undone.state.pieces.find(piece => piece.id === "blue-1").x, 3);
  const undoneZone = undoTimeline(undone.timeline);
  assert.equal(Boolean(undoneZone.state.tracker.matchActionState.groupMove?.active), false);
  assert.equal(undoneZone.state.tracker.usedActions.blue, 4);
  const redoneZone = redoTimeline(undoneZone.timeline);
  const redoneMove = redoTimeline(redoneZone.timeline);
  assert.equal(redoneMove.state.pieces.find(piece => piece.id === "blue-1").x, 7);
});
