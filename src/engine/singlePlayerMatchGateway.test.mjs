import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../game/gameState.mjs";
import { runSinglePlayerMatchCommand } from "./singlePlayerMatchGateway.mjs";

function state() {
  return createGameState({ gameMode: "match", pieces: [{ id: "ball", team: "BALL", x: 4, y: 5 }] });
}

test("Single Player Match gateway publishes exactly the accepted canonical controller state", () => {
  const published = [];
  const dispatched = runSinglePlayerMatchCommand({
    request: {
      state: state(),
      context: {},
      command: { id: "gateway-free-ball", type: "FREE_BALL_MOVED", payload: { x: 6, y: 5 } },
    },
    publish: payload => published.push(payload),
  });

  assert.equal(dispatched.result.accepted, true);
  assert.equal(published.length, 1);
  assert.equal(published[0].timeline, dispatched.timeline);
  assert.equal(published[0].state, dispatched.state);
});

test("Single Player Match gateway does not project a rejected command", () => {
  let published = false;
  const dispatched = runSinglePlayerMatchCommand({
    request: {
      state: state(),
      context: {},
      command: { id: "gateway-noop", type: "FREE_BALL_MOVED", payload: { x: 4, y: 5 } },
    },
    publish: () => { published = true; },
  });

  assert.equal(dispatched.result.accepted, false);
  assert.equal(published, false);
});
