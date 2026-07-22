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
  return {
    boardSettings: { cols: 20, rows: 12 },
    gameplayCards: [
      { id: "card-blue-1", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 4 }] },
      { id: "card-red-1", defensiveArea: [{ dx: 2, dy: 0 }] },
      { id: "card-red-2", defensiveArea: [{ dx: -2, dy: 0 }] },
    ],
  };
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

test("Single Player Controller records normal Pass targeting and cancellation as separate Undo/Redo steps", () => {
  const started = dispatchSinglePlayerGameCommand({
    state: normalMoveState(), context: normalMoveContext(),
    command: { id: "controller-pass-start", type: "PASS_STARTED", payload: { pieceId: "blue-1", passId: "controller-pass" } },
  });
  const cancelled = dispatchSinglePlayerGameCommand({
    timeline: started.timeline, state: started.state, context: normalMoveContext(),
    command: { id: "controller-pass-cancel", type: "PASS_CANCELLED", payload: { passId: "controller-pass" } },
  });
  assert.deepEqual(cancelled.timeline.entries.map(entry => entry.type), ["PASS_TARGETING_STARTED", "PASS_CANCELLED"]);
  const undoCancel = undoTimeline(cancelled.timeline);
  assert.equal(undoCancel.state.actionResolution.id, "controller-pass");
  const undoStart = undoTimeline(undoCancel.timeline);
  assert.equal(undoStart.state.actionResolution, null);
  const redoStart = redoTimeline(undoStart.timeline);
  const redoCancel = redoTimeline(redoStart.timeline);
  assert.equal(redoCancel.state.actionResolution, null);
});

test("Single Player Controller records Pass target selection as its own ordinary Undo/Redo step", () => {
  const started = dispatchSinglePlayerGameCommand({
    state: normalMoveState(), context: normalMoveContext(),
    command: { id: "controller-target-start", type: "PASS_STARTED", payload: { pieceId: "blue-1", passId: "controller-target" } },
  });
  const selected = dispatchSinglePlayerGameCommand({
    timeline: started.timeline, state: started.state, context: normalMoveContext(),
    command: { id: "controller-target-select", type: "PASS_TARGET_SELECTED", payload: { passId: "controller-target", x: 8, y: 5 } },
  });
  assert.deepEqual(selected.timeline.entries.map(entry => entry.type), ["PASS_TARGETING_STARTED", "PASS_TARGET_SELECTED"]);
  assert.deepEqual(selected.state.actionResolution.target, { x: 8, y: 5 });
  const undone = undoTimeline(selected.timeline);
  assert.equal(undone.state.actionResolution.status, "targeting");
  const redone = redoTimeline(undone.timeline);
  assert.equal(redone.state.actionResolution.status, "route-selection");
  assert.deepEqual(redone.state.actionResolution.target, { x: 8, y: 5 });
});

test("Single Player Controller keeps Bonus Pass start and cancellation in one atomic transaction", () => {
  const start = createGameState({
    ...normalMoveState(),
    actionContinuation: {
      id: "controller-bonus-pass",
      kind: "bonus-card-action",
      team: "blue",
      status: "ready",
      resumePolicy: { type: "resume-phase", team: "blue", phase: "attack" },
    },
  });
  const started = dispatchSinglePlayerGameCommand({
    state: start, context: normalMoveContext(),
    command: { id: "controller-bonus-pass-start", type: "PASS_STARTED", payload: { pieceId: "blue-1", passId: "controller-bonus-pass-targeting" } },
  });
  const cancelled = dispatchSinglePlayerGameCommand({
    timeline: started.timeline, state: started.state, context: normalMoveContext(),
    command: { id: "controller-bonus-pass-cancel", type: "PASS_CANCELLED", payload: { passId: "controller-bonus-pass-targeting" } },
  });
  assert.deepEqual(cancelled.timeline.entries.map(entry => entry.type), ["BONUS_PASS_TARGETING_STARTED", "PASS_CANCELLED"]);
  const undone = undoAtomicTimelineTransaction(cancelled.timeline);
  assert.equal(undone.state.actionResolution, null);
  assert.equal(undone.state.actionContinuation.status, "ready");
  const redone = redoAtomicTimelineTransaction(undone.timeline);
  assert.equal(redone.state.actionResolution, null);
  assert.equal(redone.state.actionContinuation.status, "ready");
});

test("Single Player Controller keeps Bonus Pass target selection in its atomic Undo/Redo transaction", () => {
  const start = createGameState({
    ...normalMoveState(),
    actionContinuation: { id: "controller-bonus-target", kind: "bonus-card-action", team: "blue", status: "ready", resumePolicy: { type: "resume-phase", team: "blue", phase: "attack" } },
  });
  const started = dispatchSinglePlayerGameCommand({
    state: start, context: normalMoveContext(),
    command: { id: "controller-bonus-target-start", type: "PASS_STARTED", payload: { pieceId: "blue-1", passId: "controller-bonus-target-pass" } },
  });
  const selected = dispatchSinglePlayerGameCommand({
    timeline: started.timeline, state: started.state, context: normalMoveContext(),
    command: { id: "controller-bonus-target-select", type: "PASS_TARGET_SELECTED", payload: { passId: "controller-bonus-target-pass", x: 8, y: 5 } },
  });
  assert.deepEqual(selected.timeline.entries.map(entry => entry.type), ["BONUS_PASS_TARGETING_STARTED", "PASS_TARGET_SELECTED"]);
  const undone = undoAtomicTimelineTransaction(selected.timeline);
  assert.equal(undone.state.actionResolution, null);
  assert.equal(undone.state.actionContinuation.status, "ready");
  const redone = redoAtomicTimelineTransaction(undone.timeline);
  assert.equal(redone.state.actionResolution.status, "route-selection");
  assert.deepEqual(redone.state.actionResolution.target, { x: 8, y: 5 });
});

test("Single Player Controller records normal Pass route confirmation as the action-consuming Undo/Redo step", () => {
  const started = dispatchSinglePlayerGameCommand({ state: normalMoveState(), context: normalMoveContext(), command: { id: "controller-route-start", type: "PASS_STARTED", payload: { pieceId: "blue-1", passId: "controller-route" } } });
  const targeted = dispatchSinglePlayerGameCommand({ timeline: started.timeline, state: started.state, context: normalMoveContext(), command: { id: "controller-route-target", type: "PASS_TARGET_SELECTED", payload: { passId: "controller-route", x: 8, y: 5 } } });
  const confirmed = dispatchSinglePlayerGameCommand({ timeline: targeted.timeline, state: targeted.state, context: normalMoveContext(), command: { id: "controller-route-confirm", type: "PASS_ROUTE_CONFIRMED", payload: { passId: "controller-route", cornerId: "top-left" } } });
  assert.deepEqual(confirmed.timeline.entries.map(entry => entry.type), ["PASS_TARGETING_STARTED", "PASS_TARGET_SELECTED", "PASS_CONFIRMED"]);
  assert.equal(confirmed.state.tracker.usedActions.blue, 1);
  const undone = undoTimeline(confirmed.timeline);
  assert.equal(undone.state.tracker.usedActions.blue, 0);
  assert.equal(undone.state.actionResolution.status, "route-selection");
  const redone = redoTimeline(undone.timeline);
  assert.equal(redone.state.tracker.usedActions.blue, 1);
  assert.equal(redone.state.actionResolution.status, "completing");
});

test("Single Player Controller keeps Bonus Pass route confirmation in its atomic transaction", () => {
  const start = createGameState({
    ...normalMoveState(),
    actionContinuation: { id: "controller-bonus-route", kind: "bonus-card-action", team: "blue", status: "ready", resumePolicy: { type: "resume-phase", team: "blue", phase: "attack" } },
  });
  const started = dispatchSinglePlayerGameCommand({ state: start, context: normalMoveContext(), command: { id: "controller-bonus-route-start", type: "PASS_STARTED", payload: { pieceId: "blue-1", passId: "controller-bonus-route-pass" } } });
  const targeted = dispatchSinglePlayerGameCommand({ timeline: started.timeline, state: started.state, context: normalMoveContext(), command: { id: "controller-bonus-route-target", type: "PASS_TARGET_SELECTED", payload: { passId: "controller-bonus-route-pass", x: 8, y: 5 } } });
  const confirmed = dispatchSinglePlayerGameCommand({ timeline: targeted.timeline, state: targeted.state, context: normalMoveContext(), command: { id: "controller-bonus-route-confirm", type: "PASS_ROUTE_CONFIRMED", payload: { passId: "controller-bonus-route-pass", cornerId: "top-left" } } });
  assert.equal(confirmed.state.tracker.usedActions.blue, 0);
  const undone = undoAtomicTimelineTransaction(confirmed.timeline);
  assert.equal(undone.state.actionResolution, null);
  assert.equal(undone.state.actionContinuation.status, "ready");
  const redone = redoAtomicTimelineTransaction(undone.timeline);
  assert.equal(redone.state.actionResolution.status, "completing");
  assert.equal(redone.state.tracker.usedActions.blue, 0);
});

test("Single Player Controller records normal Pass interceptor choice as an Undo/Redo step", () => {
  const state = createGameState({
    ...normalMoveState(),
    pieces: [...normalMoveState().pieces,
      { id: "red-1", team: "B", cardId: "card-red-1", x: 5, y: 7 },
      { id: "red-2", team: "B", cardId: "card-red-2", x: 5, y: 3 },
    ],
  });
  const started = dispatchSinglePlayerGameCommand({ state, context: normalMoveContext(), command: { id: "controller-interceptor-start", type: "PASS_STARTED", payload: { pieceId: "blue-1", passId: "controller-interceptor" } } });
  const targeted = dispatchSinglePlayerGameCommand({ timeline: started.timeline, state: started.state, context: normalMoveContext(), command: { id: "controller-interceptor-target", type: "PASS_TARGET_SELECTED", payload: { passId: "controller-interceptor", x: 9, y: 5 } } });
  const routed = dispatchSinglePlayerGameCommand({ timeline: targeted.timeline, state: targeted.state, context: normalMoveContext(), command: { id: "controller-interceptor-route", type: "PASS_ROUTE_CONFIRMED", payload: { passId: "controller-interceptor", cornerId: "top-left" } } });
  const selected = dispatchSinglePlayerGameCommand({
    timeline: routed.timeline, state: routed.state, context: normalMoveContext(),
    command: { id: "controller-interceptor-choice", type: "PASS_INTERCEPTOR_SELECTED", payload: { passId: "controller-interceptor", decisionId: routed.state.actionResolution.pendingDecision.id, pieceId: "red-2" } },
  });
  assert.equal(selected.timeline.entries.at(-1).type, "PASS_INTERCEPTOR_SELECTED");
  assert.equal(selected.state.actionResolution.pendingRoll.subjectId, "red-2");
  const undone = undoTimeline(selected.timeline);
  assert.equal(undone.state.actionResolution.status, "awaiting-interceptor-choice");
  const redone = redoTimeline(undone.timeline);
  assert.equal(redone.state.actionResolution.pendingRoll.subjectId, "red-2");
});

test("Single Player Controller records a Pass interception roll before the delayed resolver runs", () => {
  const state = createGameState({
    ...normalMoveState(),
    pieces: [...normalMoveState().pieces, { id: "red-1", team: "B", cardId: "card-red-1", x: 5, y: 7 }],
  });
  const started = dispatchSinglePlayerGameCommand({ state, context: normalMoveContext(), command: { id: "controller-roll-start", type: "PASS_STARTED", payload: { pieceId: "blue-1", passId: "controller-roll" } } });
  const targeted = dispatchSinglePlayerGameCommand({ timeline: started.timeline, state: started.state, context: normalMoveContext(), command: { id: "controller-roll-target", type: "PASS_TARGET_SELECTED", payload: { passId: "controller-roll", x: 9, y: 5 } } });
  const routed = dispatchSinglePlayerGameCommand({ timeline: targeted.timeline, state: targeted.state, context: normalMoveContext(), command: { id: "controller-roll-route", type: "PASS_ROUTE_CONFIRMED", payload: { passId: "controller-roll", cornerId: "top-left" } } });
  const pendingRoll = routed.state.actionResolution.pendingRoll;
  const rolled = dispatchSinglePlayerGameCommand({
    timeline: routed.timeline, state: routed.state, context: normalMoveContext(),
    command: { id: "controller-roll-submit", type: "PASS_INTERCEPTION_ROLL_SUBMITTED", payload: { passId: "controller-roll", createdAt: 1000, rollEvent: { id: "controller-roll-event", requestId: pendingRoll.requestId, actionId: "controller-roll", team: "red", dieType: 20, natural: 11, source: "RANDOM", createdAt: 1000, subjectId: "red-1", reactionIndex: 0 } } },
  });
  assert.equal(rolled.timeline.entries.at(-1).type, "DICE_ROLLED");
  assert.equal(rolled.state.actionResolution.status, "awaiting-interception-resolution");
  const undone = undoTimeline(rolled.timeline);
  assert.equal(undone.state.actionResolution.status, "awaiting-interception-roll");
  const redone = redoTimeline(undone.timeline);
  assert.equal(redone.state.actionResolution.status, "awaiting-interception-resolution");
});
