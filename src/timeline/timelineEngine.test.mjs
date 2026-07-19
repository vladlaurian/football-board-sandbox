import test from "node:test";
import assert from "node:assert/strict";
import { createGameState } from "../game/gameState.mjs";
import {
  commitTimelineEntry,
  createTimeline,
  forkTimeline,
  moveTimelineCursor,
  atomicTimelineTransactionId,
  redoTimeline,
  redoAtomicTimelineTransaction,
  timelineStateAt,
  undoTimeline,
  undoAtomicTimelineTransaction,
} from "./timelineEngine.mjs";

function state(x) {
  return {
    gameMode: "match",
    pieces: [{ id: "A-1", team: "A", x, y: 2 }],
    movementStateByPieceId: {},
  };
}

test("commit, undo and redo use the same timeline entry", () => {
  let timeline = createTimeline(state(1), { recordingId: "match-test" });
  timeline = commitTimelineEntry(timeline, {
    id: "move-1",
    type: "PIECE_MOVED",
    label: "Blue A-1 → C3",
    before: state(1),
    after: state(2),
  });
  assert.equal(timeline.entries.length, 1);
  assert.equal(timeline.cursor, 1);

  const undone = undoTimeline(timeline);
  assert.equal(undone.timeline.cursor, 0);
  assert.equal(undone.state.pieces[0].x, 1);

  const redone = redoTimeline(undone.timeline);
  assert.equal(redone.timeline.cursor, 1);
  assert.equal(redone.state.pieces[0].x, 2);
});

test("the Match Started audit entry keeps cursor zero as a playable match baseline", () => {
  const playableStart = {
    ...state(1),
    tracker: {
      gameStarted: true,
      startingTeam: "blue",
      currentTurn: 1,
      usedActions: { blue: 0, red: 0 },
      actionLog: { blue: [], red: [] },
      matchActionState: {},
      turnPhase: "attack",
    },
  };
  let timeline = createTimeline(playableStart);
  timeline = commitTimelineEntry(timeline, {
    type: "MATCH_STARTED",
    before: playableStart,
    after: playableStart,
  }, { allowNoop: true });
  const cursorZero = moveTimelineCursor(timeline, 0).state;
  assert.equal(cursorZero.tracker.gameStarted, true);
  assert.equal(cursorZero.tracker.currentTurn, 1);
  assert.equal(cursorZero.tracker.startingTeam, "blue");
});

test("timeline entries retain explicit dice-test metadata", () => {
  let timeline = createTimeline(state(1));
  timeline = commitTimelineEntry(timeline, {
    type: "DICE_ROLLED",
    metadata: { rollSource: "CHOSEN", chosenResult: 20 },
    before: state(1),
    after: state(1),
  }, { allowNoop: true });
  assert.deepEqual(timeline.entries[0].metadata, { rollSource: "CHOSEN", chosenResult: 20 });
});

test("atomic action metadata makes activation, roll and result one undoable transaction", () => {
  const ready = { ...state(1), actionResolution: null, actionContinuation: { id: "bonus-a", kind: "bonus-card-action", team: "blue", status: "ready" } };
  const active = { ...ready, actionContinuation: { ...ready.actionContinuation, status: "action-active", actionType: "PASS", pieceId: "A-1" } };
  const targeting = { ...active, actionResolution: { id: "pass-a", kind: "pass", status: "targeting" } };
  const rolled = { ...active, actionResolution: { id: "pass-a", kind: "pass", status: "awaiting-interception-roll" }, dice: { blueResult: 20 } };
  const complete = { ...state(3), actionResolution: null, actionContinuation: { ...active.actionContinuation, status: "awaiting-end-bonus-action" } };
  const metadata = { actionTransaction: { id: "bonus-a", actionType: "PASS", team: "blue", source: "natural-20-interception", undoMode: "atomic" } };
  let timeline = createTimeline(ready);
  timeline = commitTimelineEntry(timeline, { type: "BONUS_CARD_ACTION_STARTED", groupId: "bonus-a", metadata, before: ready, after: active }, { allowNoop: true });
  timeline = commitTimelineEntry(timeline, { type: "PASS_TARGETING_STARTED", groupId: "bonus-a", metadata, before: active, after: targeting }, { allowNoop: true });
  timeline = commitTimelineEntry(timeline, { type: "DICE_ROLLED", groupId: "bonus-a", metadata, before: targeting, after: rolled });
  timeline = commitTimelineEntry(timeline, { type: "PASS_COMPLETED", groupId: "bonus-a", metadata, before: rolled, after: complete });

  assert.equal(atomicTimelineTransactionId(timeline.entries[0]), "bonus-a");
  const undone = undoAtomicTimelineTransaction(timeline);
  assert.equal(undone.timeline.cursor, 0);
  assert.equal(undone.entries.length, 4);
  assert.equal(undone.state.pieces[0].x, 1);
  assert.equal(undone.state.actionResolution, null);
  assert.equal(undone.state.actionContinuation.status, "ready");

  const redone = redoAtomicTimelineTransaction(undone.timeline);
  assert.equal(redone.timeline.cursor, 4);
  assert.equal(redone.entries.length, 4);
  assert.equal(redone.state.pieces[0].x, 3);
  assert.equal(redone.state.actionResolution, null);
  assert.equal(redone.state.actionContinuation.status, "awaiting-end-bonus-action");
});

test("a die roll and its automatic resolution are one atomic undo transaction", () => {
  const awaitingRoll = { ...state(1), actionResolution: { id: "pass-a", kind: "pass", status: "awaiting-interception-roll" } };
  const rolled = { ...awaitingRoll, dice: { blueResult: 5 } };
  const resolved = { ...state(2), actionResolution: null, dice: { blueResult: 5 } };
  const metadata = { undoTransaction: { id: "resolution-pass-a-roll-1", source: "roll-resolution", undoMode: "atomic" } };
  let timeline = createTimeline(awaitingRoll);
  timeline = commitTimelineEntry(timeline, { type: "DICE_ROLLED", metadata, before: awaitingRoll, after: rolled });
  timeline = commitTimelineEntry(timeline, { type: "PASS_COMPLETED", metadata, before: rolled, after: resolved });

  assert.equal(atomicTimelineTransactionId(timeline.entries[0]), "resolution-pass-a-roll-1");
  const undone = undoAtomicTimelineTransaction(timeline);
  assert.equal(undone.timeline.cursor, 0);
  assert.equal(undone.entries.length, 2);
  assert.equal(undone.state.actionResolution.status, "awaiting-interception-roll");
  assert.equal(undone.state.dice?.blueResult, null);

  const redone = redoAtomicTimelineTransaction(undone.timeline);
  assert.equal(redone.timeline.cursor, 2);
  assert.equal(redone.entries.length, 2);
  assert.equal(redone.state.actionResolution, null);
  assert.equal(redone.state.pieces[0].x, 2);
});

test("matching group ids without atomic metadata remain stepwise", () => {
  let timeline = createTimeline(state(1));
  timeline = commitTimelineEntry(timeline, { type: "MOVE_ACTIVATED", groupId: "move-a", before: state(1), after: state(2) });
  timeline = commitTimelineEntry(timeline, { type: "PIECE_MOVED", groupId: "move-a", before: state(2), after: state(3) });
  assert.equal(atomicTimelineTransactionId(timeline.entries[1]), null);
  const undone = undoAtomicTimelineTransaction(timeline);
  assert.equal(undone.timeline.cursor, 1);
  assert.equal(undone.state.pieces[0].x, 2);
});

test("a bonus Move is restored as one generic atomic action", () => {
  const metadata = { actionTransaction: { id: "bonus-move", actionType: "MOVE", team: "blue", source: "natural-20-interception", undoMode: "atomic" } };
  const ready = { ...state(1), actionContinuation: { id: "bonus-move", kind: "bonus-card-action", team: "blue", status: "ready" } };
  const active = { ...ready, actionContinuation: { ...ready.actionContinuation, status: "action-active", actionType: "MOVE", pieceId: "A-1" } };
  const moved = { ...state(4), actionContinuation: { ...active.actionContinuation, status: "awaiting-end-bonus-action" } };
  let timeline = createTimeline(ready);
  timeline = commitTimelineEntry(timeline, { type: "BONUS_CARD_ACTION_STARTED", groupId: "bonus-move", metadata, before: ready, after: active }, { allowNoop: true });
  timeline = commitTimelineEntry(timeline, { type: "PIECE_MOVED", groupId: "bonus-move", metadata, before: active, after: moved });
  const undone = undoAtomicTimelineTransaction(timeline);
  assert.equal(undone.timeline.cursor, 0);
  assert.equal(undone.state.pieces[0].x, 1);
  assert.equal(undone.state.actionContinuation.status, "ready");
});

test("a bonus Pass without a roll is still one atomic action", () => {
  const metadata = { actionTransaction: { id: "bonus-direct-pass", actionType: "PASS", team: "blue", source: "natural-20-interception", undoMode: "atomic" } };
  const ready = { ...state(1), actionResolution: null, actionContinuation: { id: "bonus-direct-pass", kind: "bonus-card-action", team: "blue", status: "ready" } };
  const targeting = { ...ready, actionResolution: { id: "pass-direct", kind: "pass", status: "targeting" }, actionContinuation: { ...ready.actionContinuation, status: "action-active", actionType: "PASS", pieceId: "A-1" } };
  const completed = { ...state(1), actionResolution: null, actionContinuation: { ...targeting.actionContinuation, status: "awaiting-end-bonus-action" } };
  let timeline = createTimeline(ready);
  timeline = commitTimelineEntry(timeline, { type: "BONUS_CARD_ACTION_STARTED", groupId: "bonus-direct-pass", metadata, before: ready, after: targeting }, { allowNoop: true });
  timeline = commitTimelineEntry(timeline, { type: "PASS_COMPLETED", groupId: "bonus-direct-pass", metadata, before: targeting, after: completed });
  const undone = undoAtomicTimelineTransaction(timeline);
  assert.equal(undone.state.actionResolution, null);
  assert.equal(undone.state.actionContinuation.status, "ready");
  const redone = redoAtomicTimelineTransaction(undone.timeline);
  assert.equal(redone.state.actionResolution, null);
  assert.equal(redone.state.actionContinuation.status, "awaiting-end-bonus-action");
});

test("a new action after undo removes the abandoned redo branch", () => {
  let timeline = createTimeline(state(1));
  timeline = commitTimelineEntry(timeline, { type: "MOVE", before: state(1), after: state(2) });
  timeline = commitTimelineEntry(timeline, { type: "MOVE", before: state(2), after: state(3) });
  timeline = undoTimeline(timeline).timeline;
  timeline = commitTimelineEntry(timeline, { type: "MOVE", before: state(2), after: state(8) });
  assert.equal(timeline.entries.length, 2);
  assert.equal(timeline.entries[1].after.pieces[0].x, 8);
  assert.equal(redoTimeline(timeline).state, null);
});

test("cursor navigation and fork preserve the original recording", () => {
  let timeline = createTimeline(state(1), { recordingId: "original" });
  timeline = commitTimelineEntry(timeline, { id: "one", type: "MOVE", before: state(1), after: state(2) });
  timeline = commitTimelineEntry(timeline, { id: "two", type: "MOVE", before: state(2), after: state(3) });
  const moved = moveTimelineCursor(timeline, 1);
  assert.equal(moved.state.pieces[0].x, 2);

  const branch = forkTimeline(timeline, 1);
  assert.equal(branch.parentRecordingId, "original");
  assert.equal(branch.forkedAtEntryId, "one");
  assert.equal(branch.initialState.pieces[0].x, 2);
  assert.equal(timeline.entries.length, 2);
});

test("timeline game state excludes Tracker panel visibility", () => {
  const snapshot = createGameState({
    gameMode: "match",
    tracker: { enabled: true, gameStarted: true },
  });
  assert.equal(snapshot.tracker.gameStarted, true);
  assert.equal(Object.hasOwn(snapshot.tracker, "enabled"), false);
});

test("sequential card actions accumulate in the state at the timeline cursor", () => {
  let timeline = createTimeline({
    ...state(1),
    tracker: { actionLog: { blue: [], red: [] }, usedActions: { blue: 0, red: 0 } },
  });
  const types = ["PASS", "SHOT", "CROSS", "MOVE"];
  for (const [index, type] of types.entries()) {
    const before = timelineStateAt(timeline, timeline.cursor);
    const actionLog = {
      blue: [...before.tracker.actionLog.blue, { id: `action-${index}`, type, pieceId: "A-1" }],
      red: [],
    };
    const after = createGameState({
      ...before,
      tracker: {
        ...before.tracker,
        actionLog,
        usedActions: { blue: actionLog.blue.length, red: 0 },
      },
    });
    timeline = commitTimelineEntry(timeline, {
      id: `action-${index}`,
      type: `${type}_ACTIVATED`,
      before,
      after,
    });
  }
  const finalState = timelineStateAt(timeline, timeline.cursor);
  assert.deepEqual(finalState.tracker.actionLog.blue.map(item => item.type), types);
  assert.equal(finalState.tracker.usedActions.blue, 4);
});

test("a pending decision survives Undo and Redo as gameplay state", () => {
  const beforeDecision = { ...state(1), actionResolution: { id: "pass-tie", kind: "pass", status: "awaiting-interceptor-choice", pendingDecision: { id: "decision-a", type: "CHOOSE_INTERCEPTOR", team: "red", options: [{ id: "R-1" }, { id: "R-2" }] } } };
  const afterDecision = { ...beforeDecision, actionResolution: { ...beforeDecision.actionResolution, status: "awaiting-interception-roll", pendingDecision: null, pendingRoll: { requestId: "request-a", actionId: "pass-tie", team: "red", subjectId: "R-1", reactionIndex: 0 } } };
  let timeline = createTimeline(beforeDecision);
  timeline = commitTimelineEntry(timeline, { type: "PASS_INTERCEPTOR_SELECTED", before: beforeDecision, after: afterDecision });
  const undone = undoTimeline(timeline);
  assert.equal(undone.state.actionResolution.pendingDecision.id, "decision-a");
  const redone = redoTimeline(undone.timeline);
  assert.equal(redone.state.actionResolution.pendingRoll.requestId, "request-a");
});
