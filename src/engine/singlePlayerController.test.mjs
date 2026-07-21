import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createGameState } from "../game/gameState.mjs";
import { redoTimeline, undoTimeline } from "../timeline/timelineEngine.mjs";
import { dispatchSinglePlayerGameCommand } from "./singlePlayerController.mjs";

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

test("Single Player Controller does not depend on UI, Firebase, or browser APIs", () => {
  const source = fs.readFileSync(new URL("./singlePlayerController.mjs", import.meta.url), "utf8");
  const forbidden = /(?:from\s+["'](?:react|firebase\/|firebase)["']|\bwindow\b|\bdocument\b|\blocalStorage\b|\bsetTimeout\b|\bsetInterval\b|\bfetch\b|\bXMLHttpRequest\b)/;
  assert.equal(forbidden.test(source), false);
});
