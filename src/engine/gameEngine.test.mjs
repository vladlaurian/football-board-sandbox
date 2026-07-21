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

test("engine modules do not depend on UI, Firebase, or browser APIs", () => {
  const moduleFiles = ["gameEngine.mjs", "gameCommands.mjs", "gameEvents.mjs", "matchContext.mjs", "singlePlayerController.mjs"];
  const forbidden = /(?:from\s+["'](?:react|firebase\/|firebase)["']|\bwindow\b|\bdocument\b|\blocalStorage\b|\bsetTimeout\b|\bsetInterval\b|\bfetch\b|\bXMLHttpRequest\b)/;
  moduleFiles.forEach(file => {
    const source = fs.readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    assert.equal(forbidden.test(source), false, `${file} imports or uses a forbidden runtime dependency`);
  });
});
